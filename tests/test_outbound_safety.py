"""Exercise actual authenticated routes with a mocked, never-network transport."""
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from sqlalchemy import func, select

from app.auth import get_current_user
from app.database import get_db
from app.main import app
from app.models import SmtpAccount, SmtpMessage
from app.sender import SendResult
from app.suppression import suppress_email
from tests.conftest import make_campaign, make_campaign_inbox, make_inbox, make_sequence


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ["reply", "unibox", "template", "campaign"])
@pytest.mark.parametrize("condition", ["suppressed", "paused", "allowed", "unauthenticated"])
async def test_outbound_route_policy(session, monkeypatch, route, condition):
    inbox = await make_inbox(session, email="sender@example.com", provider="smtp")
    inbox.paused = condition == "paused"
    session.add(SmtpAccount(inbox_id=inbox.id, smtp_host="never-connect.invalid"))
    campaign = await make_campaign(session)
    await make_campaign_inbox(session, campaign.id, inbox.id)
    seq = await make_sequence(session, campaign.id)
    if condition == "suppressed":
        await suppress_email(session, "blocked@example.com", stop_active_sends=False)
    await session.commit()

    transport = Mock(return_value=SendResult(message_id="<mock@example.com>", thread_id="mock-thread"))
    for target in ("app.sender.send_email", "app.routers.unibox.send_email", "app.routers.templates.send_email"):
        monkeypatch.setattr(target, transport)
    # Fail closed if a future refactor accidentally bypasses the patched transport.
    def no_network(*args, **kwargs):
        raise AssertionError("Outbound network is forbidden in this test")
    monkeypatch.setattr("socket.create_connection", no_network)

    address = "BLOCKED@EXAMPLE.COM" if condition == "suppressed" else "operator@example.com"
    payload = dict(inbox_id=inbox.id, to_email=address, subject="P0 test", body="No real delivery")
    path = {"reply": "/api/ui/reply", "unibox": "/api/unibox/send",
            "template": "/api/templates/actions/test-send",
            "campaign": f"/api/campaigns/{campaign.id}/send-test"}[route]
    if route == "campaign":
        payload = dict(sequence_id=seq.id, to_email=address)
    async def db_override():
        yield session
    old = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = db_override
    if condition != "unauthenticated":
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role="admin", is_active=True)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(path, json=payload)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(old)
    if condition == "allowed":
        assert response.status_code == 200, response.text
        assert transport.call_count == 1
        assert transport.call_args.kwargs["to_email"] == address
    else:
        assert transport.call_count == 0, f"{route}/{condition} reached transport"
        assert response.status_code in ({401, 403} if condition == "unauthenticated" else {400, 409}), response.text
        assert (await session.execute(select(func.count()).select_from(SmtpMessage))).scalar() == 0
