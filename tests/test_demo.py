"""Demo stays isolated, idempotent and unable to send messages."""
from datetime import datetime
from pathlib import Path
import imaplib
import smtplib

import pytest
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.testclient import TestClient
from sqlalchemy import select, func

from app.demo.seed import seed_demo, MARKER
from app.demo.server import validate_demo_target, block_mail_transports, allowed_request, DemoMiddleware
from app.models import (Lead, Inbox, Campaign, QueueSlot, EmailLog, MessageTemplateVersion,
                        SmtpMessage, Notification, AppSetting, SmtpAccount)

PASSWORD = "DemoTest-NotARealPassword-123"
NOW = datetime(2026, 9, 25, 12, 30)


@pytest.mark.asyncio
async def test_seed_populates_relations_and_is_idempotent(session):
    summary = await seed_demo(session, PASSWORD, NOW)
    await session.commit()
    expected = {Lead: 60, Inbox: 3, Campaign: 6, QueueSlot: 48, EmailLog: 120,
                MessageTemplateVersion: 12, SmtpMessage: 36, Notification: 12}
    for model, count in expected.items():
        assert (await session.execute(select(func.count()).select_from(model))).scalar() == count
    lead = (await session.execute(select(Lead).limit(1))).scalar_one()
    lead.name = "Edited demo contact"
    await session.commit()
    assert await seed_demo(session, PASSWORD, datetime(2026, 10, 1)) == summary
    await session.refresh(lead)
    assert lead.name == "Edited demo contact"
    assert (await session.execute(select(func.count()).select_from(Lead))).scalar() == 60
    for inbox in (await session.execute(select(Inbox))).scalars():
        assert inbox.email.endswith("@sekaro-demo.invalid")
    for account in (await session.execute(select(SmtpAccount))).scalars():
        assert account.smtp_password == account.imap_password == ""


@pytest.mark.asyncio
async def test_seed_refuses_existing_operational_data(session):
    session.add(Lead(email="existing@example.test", name="Existing"))
    await session.commit()
    with pytest.raises(ValueError, match="non-empty"):
        await seed_demo(session, PASSWORD, NOW)
    assert (await session.execute(select(func.count()).select_from(Inbox))).scalar() == 0
    assert await session.get(AppSetting, MARKER) is None


@pytest.mark.asyncio
async def test_seed_transaction_rolls_back(session):
    await seed_demo(session, PASSWORD, NOW)
    await session.rollback()
    assert (await session.execute(select(func.count()).select_from(Lead))).scalar() == 0
    assert await session.get(AppSetting, MARKER) is None


def test_target_guard_fails_before_connecting_to_production(monkeypatch):
    monkeypatch.setenv("SEKARO_DEMO_MODE", "1")
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    validate_demo_target("postgresql+asyncpg://sekaro_demo:password@demo-db/sekaro_demo")
    for url in ["postgresql+asyncpg://sekaro:password@db/sekaro",
                "postgresql+asyncpg://sekaro_demo:password@db/sekaro_demo",
                "sqlite+aiosqlite:///demo.db"]:
        with pytest.raises(RuntimeError):
            validate_demo_target(url)
    monkeypatch.setenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    with pytest.raises(RuntimeError):
        validate_demo_target("postgresql+asyncpg://sekaro_demo:password@demo-db/sekaro_demo")


def test_smtp_ssl_and_imap_are_blocked_before_network(monkeypatch):
    # Register originals for automatic restoration after the test.
    monkeypatch.setattr(smtplib.SMTP, "connect", smtplib.SMTP.connect)
    monkeypatch.setattr(imaplib.IMAP4, "open", imaplib.IMAP4.open)
    block_mail_transports()
    for factory in [smtplib.SMTP, smtplib.SMTP_SSL, imaplib.IMAP4, imaplib.IMAP4_SSL]:
        with pytest.raises(RuntimeError, match="disabled"):
            factory("smtp.example.test")


@pytest.mark.parametrize("path", ["/api/ui/reply", "/api/unibox/send", "/api/unibox/sync",
    "/api/campaigns/1/send-test", "/api/templates/actions/test-send", "/api/smtp/inboxes/1/test",
    "/api/settings/webhooks", "/api/inboxes/1/beacon/connect", "/api/auth/restore",
    "/api/campaigns/1/leads/verify", "/api/mcp"])
def test_external_and_restore_actions_are_denied(path):
    assert not allowed_request("POST", path)


def test_banner_and_forbidden_actions_are_visible_without_running_real_handlers():
    app = FastAPI()
    app.add_middleware(DemoMiddleware)

    @app.get("/", response_class=HTMLResponse)
    def index():
        return '<html><body><div id="root"></div></body></html>'

    @app.post("/api/ui/reply")
    def forbidden():
        raise AssertionError("Outbound handler must never run")

    with TestClient(app) as client:
        assert "fikcyjne dane" in client.get("/").text
        assert client.post("/api/ui/reply").status_code == 403
        assert client.get("/api/demo/status").json()["sending_enabled"] is False
    assert allowed_request("POST", "/api/unibox/threads/demo/mark-read")
    assert allowed_request("PATCH", "/api/leads/1")
    assert allowed_request("POST", "/api/templates/preview/render")


def test_compose_does_not_share_production_resources():
    import yaml
    config = yaml.safe_load(Path("docker-compose.demo.yml").read_text())
    assert config["networks"]["demo-only"]["internal"] is True
    assert set(config["volumes"]) == {"demo_pgdata"}
    app = config["services"]["demo-app"]
    assert app["ports"] == ["127.0.0.1:5051:8000"]
    assert "env_file" not in app
    assert app["volumes"] == ["./app/demo:/app/app/demo:ro"]
    assert "app.demo.server:create_app" in app["command"]
    assert "app/demo" not in Path("app/main.py").read_text()
