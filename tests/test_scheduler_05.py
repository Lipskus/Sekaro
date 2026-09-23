"""Sekaro 0.5 scheduler, rate-limit and campaign pre-flight tests."""
from datetime import datetime, timedelta

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select

from app.jobs import _claim_send_attempt, _release_send_attempt
from app.models import CampaignLead, Inbox, QueueSlot, SendAttempt, SmtpAccount
from app.queue_logic import compute_effective_wait_minutes
from app.routers.campaigns import _campaign_preflight, start_campaign, update_campaign
from app.schemas import CampaignCreate, CampaignUpdate
from tests.conftest import (
    make_campaign,
    make_campaign_inbox,
    make_campaign_lead,
    make_inbox,
    make_lead,
    make_sequence,
)


def test_effective_wait_respects_hourly_cap():
    inbox = Inbox(
        email="rate@example.com",
        max_emails_per_day=100,
        max_emails_per_hour=0,
        wait_minutes_between=5,
    )
    assert compute_effective_wait_minutes(inbox) == 5

    inbox.max_emails_per_hour = 5
    assert compute_effective_wait_minutes(inbox) == 12

    inbox.max_emails_per_hour = 1
    assert compute_effective_wait_minutes(inbox) == 60

    inbox.max_emails_per_hour = 60
    assert compute_effective_wait_minutes(inbox) == 5


def test_new_campaigns_are_paused_by_default():
    payload = CampaignCreate(name="Safe campaign", inbox_ids=[])
    assert payload.paused is True


async def _ready_campaign(session, *, subject="Hello", body="Hi there", custom_data=None):
    campaign = await make_campaign(
        session,
        name="Preflight",
        paused=True,
        sending_days=[0, 1, 2, 3, 4],
        sending_hours_start="09:00",
        sending_hours_end="17:00",
    )
    inbox = await make_inbox(
        session,
        email="sender@example.com",
        provider="smtp",
    )
    inbox.max_emails_per_hour = 5
    inbox.wait_minutes_between = 5
    await make_campaign_inbox(session, campaign.id, inbox.id)

    account = SmtpAccount(
        inbox_id=inbox.id,
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="sender@example.com",
        smtp_password="secret",
        smtp_use_tls=True,
        smtp_use_ssl=False,
        imap_host="imap.example.com",
        imap_port=993,
        imap_username="sender@example.com",
        imap_password="secret",
        imap_use_ssl=True,
        last_test_ok=True,
        last_test_error="",
    )
    session.add(account)

    await make_sequence(
        session,
        campaign_id=campaign.id,
        position=0,
        subject=subject,
        body=body,
    )
    lead = await make_lead(session, email="lead@example.com", name="Lead")
    lead.custom_data = custom_data or {}
    await make_campaign_lead(session, campaign.id, lead.id)
    await session.flush()
    return campaign, inbox, lead


@pytest.mark.asyncio
async def test_preflight_ready_campaign_reports_hourly_spacing_warning(session):
    campaign, _inbox, _lead = await _ready_campaign(session)

    report = await _campaign_preflight(session, campaign.id)

    assert report["ready"] is True
    assert report["summary"]["errors"] == 0
    assert report["summary"]["sendable_contacts"] == 1
    codes = {row["code"] for row in report["warnings"]}
    assert "hourly_spacing_applied" in codes


@pytest.mark.asyncio
async def test_preflight_blocks_missing_dynamic_variable_values(session):
    campaign, _inbox, _lead = await _ready_campaign(
        session,
        subject="Hello {{region}}",
        body="Hi {{name}}",
        custom_data={},
    )

    report = await _campaign_preflight(session, campaign.id)

    assert report["ready"] is False
    missing = [row for row in report["errors"] if row["code"] == "missing_variable_values"]
    assert len(missing) == 1
    assert missing[0]["details"]["variable"] == "region"
    assert missing[0]["details"]["contacts"] == 1


@pytest.mark.asyncio
async def test_preflight_allows_user_defined_variable_when_contact_has_value(session):
    campaign, _inbox, _lead = await _ready_campaign(
        session,
        subject="Hello {{region}}",
        body="Hi {{name}}",
        custom_data={"region": "North"},
    )

    report = await _campaign_preflight(session, campaign.id)

    assert report["ready"] is True
    assert not [row for row in report["errors"] if row["code"] == "missing_variable_values"]


@pytest.mark.asyncio
async def test_send_attempt_claim_is_exclusive_and_releasable(session):
    campaign, inbox, lead = await _ready_campaign(session)
    cl_res = await session.execute(
        select(CampaignLead).where(
            CampaignLead.campaign_id == campaign.id,
            CampaignLead.lead_id == lead.id,
        )
    )
    cl = cl_res.scalar_one()
    slot = QueueSlot(
        campaign_lead_id=cl.id,
        inbox_id=inbox.id,
        sequence_index=0,
        scheduled_date=datetime.utcnow(),
        position_in_day=1,
    )
    session.add(slot)
    await session.commit()

    first = await _claim_send_attempt(slot.id)
    second = await _claim_send_attempt(slot.id)

    assert first
    assert second is None

    rows = await session.execute(select(SendAttempt).where(SendAttempt.queue_slot_id == slot.id))
    assert rows.scalar_one_or_none() is not None

    await _release_send_attempt(slot.id, first)
    third = await _claim_send_attempt(slot.id)
    assert third
    await _release_send_attempt(slot.id, third)


@pytest.mark.asyncio
async def test_preflight_blocks_uncertain_send_attempt(session):
    campaign, inbox, lead = await _ready_campaign(session)
    cl = (
        await session.execute(
            select(CampaignLead).where(
                CampaignLead.campaign_id == campaign.id,
                CampaignLead.lead_id == lead.id,
            )
        )
    ).scalar_one()
    slot = QueueSlot(
        campaign_lead_id=cl.id,
        inbox_id=inbox.id,
        sequence_index=0,
        scheduled_date=datetime.utcnow() + timedelta(minutes=1),
        position_in_day=1,
    )
    session.add(slot)
    await session.commit()

    token = await _claim_send_attempt(slot.id)
    assert token

    report = await _campaign_preflight(session, campaign.id)
    uncertain = [row for row in report["errors"] if row["code"] == "uncertain_send_attempts"]
    assert report["ready"] is False
    assert len(uncertain) == 1
    assert slot.id in uncertain[0]["details"]["slot_ids"]

    await _release_send_attempt(slot.id, token)


@pytest.mark.asyncio
async def test_start_campaign_rejects_blocking_preflight_errors(session):
    campaign = await make_campaign(session, name="Broken start", paused=True)

    with pytest.raises(HTTPException) as exc:
        await start_campaign(campaign.id, BackgroundTasks(), session)

    assert exc.value.status_code == 409
    assert exc.value.detail["ready"] is False
    assert campaign.paused is True


@pytest.mark.asyncio
async def test_start_campaign_unpauses_ready_campaign(session):
    campaign, _inbox, _lead = await _ready_campaign(session)

    result = await start_campaign(campaign.id, BackgroundTasks(), session)
    await session.refresh(campaign)

    assert result["started"] is True
    assert result["ready"] is True
    assert campaign.paused is False


@pytest.mark.asyncio
async def test_legacy_patch_cannot_bypass_preflight(session):
    campaign = await make_campaign(session, name="Patch bypass", paused=True)

    with pytest.raises(HTTPException) as exc:
        await update_campaign(
            campaign.id,
            CampaignUpdate(paused=False),
            BackgroundTasks(),
            session,
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["ready"] is False
