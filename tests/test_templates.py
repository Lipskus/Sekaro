"""Sekaro 0.4 template and dynamic variable tests."""
import pytest

from app.models import Inbox, Lead, SmtpAccount
from app.routers.contact_fields import create_contact_field, list_contact_fields
from app.routers.templates import (
    create_template,
    create_template_version,
    preview_template,
    test_send_template,
)
from app.schemas import (
    ContactFieldCreate,
    MessageTemplateCreate,
    MessageTemplateVersionCreate,
    TemplatePreviewRequest,
    TemplateTestSendRequest,
)
from app.sender import SendResult
from app.template_renderer import render_message


def test_renderer_supports_arbitrary_user_fields():
    lead = Lead(
        email="contact@example.com",
        name="Example Contact",
        custom_data={
            "dowolne_pole": "Dowolna wartość",
            "inna_zmienna": "123",
        },
    )

    rendered = render_message(
        subject="Hej {{name}} — {{dowolne_pole}}",
        body="Kod: {{inna_zmienna}}",
        is_html=False,
        lead=lead,
    )

    assert rendered["subject"] == "Hej Example Contact — Dowolna wartość"
    assert rendered["body"] == "Kod: 123"
    assert rendered["missing_variables"] == []


def test_renderer_keeps_missing_variable_visible():
    lead = Lead(email="contact@example.com", name="", custom_data={})

    rendered = render_message(
        subject="{{brakujace_pole}}",
        body="Witaj {{name}}",
        is_html=False,
        lead=lead,
    )

    assert rendered["subject"] == "{{brakujace_pole}}"
    assert "{{name}}" in rendered["body"]
    assert rendered["missing_variables"] == ["brakujace_pole", "name"]


def test_html_renderer_escapes_contact_values():
    lead = Lead(
        email="contact@example.com",
        name="<strong>Injected</strong>",
        custom_data={"pole": "<script>alert(1)</script>"},
    )

    rendered = render_message(
        subject="{{name}}",
        body="<p>{{pole}}</p><p>{{name}}</p>",
        is_html=True,
        lead=lead,
    )

    assert rendered["subject"] == "<strong>Injected</strong>"
    assert "<script>" not in rendered["body"]
    assert "&lt;script&gt;" in rendered["body"]
    assert "&lt;strong&gt;" in rendered["body"]


@pytest.mark.asyncio
async def test_user_can_define_arbitrary_contact_field(session):
    field = await create_contact_field(
        ContactFieldCreate(key="moje_pole_123", label="Moje pole"),
        session,
    )

    assert field.key == "moje_pole_123"
    assert field.label == "Moje pole"
    assert field.system is False

    fields = await list_contact_fields(session)
    keys = {row.key for row in fields}
    assert {"email", "name", "moje_pole_123"}.issubset(keys)
    assert "land" not in keys


@pytest.mark.asyncio
async def test_template_saves_immutable_versions(session):
    created = await create_template(
        MessageTemplateCreate(
            name="Pierwszy szablon",
            subject="Temat v1",
            body="Treść {{name}}",
            is_html=False,
        ),
        session,
    )

    assert created.latest_version.version == 1
    assert created.latest_version.subject == "Temat v1"

    updated = await create_template_version(
        created.id,
        MessageTemplateVersionCreate(
            subject="Temat v2",
            body="<p>Treść v2 {{name}}</p>",
            is_html=True,
        ),
        session,
    )

    assert updated.latest_version.version == 2
    assert len(updated.versions) == 2
    assert [v.version for v in updated.versions] == [2, 1]
    assert updated.versions[1].subject == "Temat v1"


@pytest.mark.asyncio
async def test_preview_uses_selected_contact_custom_fields(session):
    lead = Lead(
        email="preview@example.com",
        name="Preview",
        custom_data={"wlasne": "ABC"},
    )
    session.add(lead)
    await session.flush()

    preview = await preview_template(
        TemplatePreviewRequest(
            subject="{{name}} / {{wlasne}}",
            body="Email: {{email}}",
            is_html=False,
            lead_id=lead.id,
        ),
        session,
    )

    assert preview["subject"] == "Preview / ABC"
    assert preview["body"] == "Email: preview@example.com"
    assert preview["missing_variables"] == []


@pytest.mark.asyncio
async def test_template_test_send_renders_contact_and_uses_smtp(session, monkeypatch):
    lead = Lead(
        email="lead@example.com",
        name="Lead",
        custom_data={"custom_key": "Rendered"},
    )
    session.add(lead)
    await session.flush()

    inbox = Inbox(
        email="sender@example.com",
        display_name="Sender",
        reply_to="reply@example.com",
        provider="smtp",
        paused=False,
    )
    session.add(inbox)
    await session.flush()

    account = SmtpAccount(
        inbox_id=inbox.id,
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="sender@example.com",
        smtp_password="secret",
        smtp_use_tls=True,
        smtp_use_ssl=False,
        imap_host="",
        imap_port=993,
        imap_username="",
        imap_password="",
        imap_use_ssl=True,
    )
    session.add(account)
    await session.flush()

    captured = {}

    def fake_send_email(**kwargs):
        captured.update(kwargs)
        return SendResult(message_id="<test@example.com>", thread_id="<test@example.com>")

    monkeypatch.setattr("app.routers.templates.send_email", fake_send_email)

    result = await test_send_template(
        TemplateTestSendRequest(
            inbox_id=inbox.id,
            to_email="test-recipient@example.com",
            lead_id=lead.id,
            subject="Hej {{name}}",
            body="Wartość: {{custom_key}}",
            is_html=False,
        ),
        session,
    )

    assert result["ok"] is True
    assert captured["to_email"] == "test-recipient@example.com"
    assert captured["subject"] == "Hej Lead"
    assert captured["body"] == "Wartość: Rendered"
    assert captured["reply_to_address"] == "reply@example.com"
    assert captured["provider"] == "smtp"
