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
    assert config["networks"]["demo-only"]["internal"] is False
    assert set(config["services"]) == {"demo-app", "demo-db"}
    assert set(config["volumes"]) == {"demo_pgdata"}
    app = config["services"]["demo-app"]
    assert app["ports"] == ["127.0.0.1:5050:8000"]
    assert app["networks"] == ["demo-only"]
    assert config["services"]["demo-db"]["networks"] == ["demo-only"]
    assert "ports" not in config["services"]["demo-db"]
    assert "env_file" not in app
    assert app["volumes"] == ["./app/demo:/app/app/demo:ro"]
    assert "app.demo.server:create_app" in app["command"]
    assert "app/demo" not in Path("app/main.py").read_text()


@pytest.mark.parametrize("command,production_running,image_missing,legacy_network", [
    ("replace-production", True, False, False),
    ("replace-production", True, True, False),
    ("up", True, False, False),
    ("reset", True, False, False),
    ("up", False, False, True),
])
def test_demo_script_replacement_boundary(tmp_path, monkeypatch, command, production_running, image_missing, legacy_network):
    """Exercise the real shell script without touching a Docker installation."""
    import json
    import os
    import shutil
    import subprocess
    import sys

    scripts = tmp_path / "scripts"
    scripts.mkdir()
    shutil.copy("scripts/sekaro-demo.sh", scripts / "sekaro-demo.sh")
    binary = tmp_path / "bin"
    binary.mkdir()
    log_path = tmp_path / "docker-calls.jsonl"
    docker = binary / "docker"
    docker.write_text(f"#!{sys.executable}\n" + '''import json, os, sys
args = sys.argv[1:]
with open(os.environ["DEMO_TEST_CALLS"], "a") as stream:
    stream.write(json.dumps(args) + "\\n")
if args[:2] == ["image", "inspect"] and os.environ["DEMO_TEST_IMAGE_MISSING"] == "1":
    sys.exit(1)
if args[:2] == ["ps", "-q"] and os.environ["DEMO_TEST_PRODUCTION_RUNNING"] == "1":
    print("existing-production-container")
if args[:2] == ["network", "inspect"]:
    print(os.environ["DEMO_TEST_LEGACY_NETWORK"])
''')
    docker.chmod(0o700)
    # reset requires initialized credentials; keep fixture values synthetic.
    demo_dir = tmp_path / ".sekaro-demo"
    demo_dir.mkdir()
    (demo_dir / "env").write_text("DEMO_ADMIN_PASSWORD=synthetic-test-only\n")
    monkeypatch.setenv("PATH", str(binary) + os.pathsep + os.environ["PATH"])
    monkeypatch.setenv("DEMO_TEST_CALLS", str(log_path))
    monkeypatch.setenv("DEMO_TEST_IMAGE_MISSING", str(int(image_missing)))
    monkeypatch.setenv("DEMO_TEST_PRODUCTION_RUNNING", str(int(production_running)))
    monkeypatch.setenv("DEMO_TEST_LEGACY_NETWORK", "true" if legacy_network else "false")
    result = subprocess.run(["bash", str(scripts / "sekaro-demo.sh"), command], capture_output=True, text=True)
    calls = [json.loads(line) for line in log_path.read_text().splitlines()]
    if legacy_network:
        assert result.returncode == 0
        stops = [call for call in calls if "down" in call]
        assert len(stops) == 1 and "sekaro-demo" in stops[0]
        assert "--remove-orphans" in stops[0]
        assert "--volumes" not in stops[0] and "-v" not in stops[0]
        assert calls.index(stops[0]) < next(i for i, call in enumerate(calls) if "up" in call)
    elif command != "replace-production" or image_missing:
        assert result.returncode != 0
        assert not any("down" in call or "up" in call for call in calls)
    else:
        assert result.returncode == 0
        destructive = [call for call in calls if "down" in call]
        assert destructive == [["compose", "-p", "sekaro", "-f", "docker-compose.sekaro.yml", "down", "--volumes"]]
        removed_at = calls.index(destructive[0])
        started_at = next(i for i, call in enumerate(calls) if "up" in call)
        assert removed_at < started_at
        assert sum("config" in call for call in calls[:removed_at]) == 2
        assert "sekaro-demo" in calls[started_at]
        assert "127.0.0.1:5050" in result.stdout
