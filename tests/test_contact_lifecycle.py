"""Lifecycle safety, identity preservation and authenticated archive routes."""
import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from app.auth import get_current_user
from app.database import get_db
from app.main import app
from app.contact_lifecycle import set_archived
from app.campaign_lead_status import campaign_lead_may_receive_sends, campaign_lead_schedule_eligibility_clause
from app.models import Lead, Campaign, CampaignLead, User, ContactOperation, LeadReply, EmailLog, QueueSlot, SendAttempt
from app.outbound_safety import outbound_block_reason
from app.suppression import suppress_email, is_suppressed
from tests.conftest import make_campaign, make_campaign_lead, make_lead, make_inbox, make_email_log, make_queue_slot

async def actor(session):
    user = User(username="operator", email="operator@example.com")
    session.add(user)
    await session.flush()
    return user

@pytest.mark.asyncio
async def test_archive_restore_preserves_identity_history_and_blocks(session):
    user = await actor(session)
    lead = await make_lead(session)
    campaign = await make_campaign(session)
    inbox = await make_inbox(session)
    enrollment = await make_campaign_lead(session, campaign.id, lead.id)
    mail = await make_email_log(session, lead.id, campaign.id, inbox_id=inbox.id)
    reply = LeadReply(lead_id=lead.id, campaign_id=campaign.id)
    session.add(reply)
    await make_queue_slot(session, enrollment.id, inbox.id)
    claimed = await make_queue_slot(session, enrollment.id, inbox.id, sequence_index=1)
    session.add(SendAttempt(queue_slot_id=claimed.id, attempt_token="uncertain"))
    await suppress_email(session, lead.email, stop_active_sends=False)
    lead.status = "unsubscribed"
    await session.commit()
    assert await set_archived(session, [lead.id, lead.id], True, user) == 1
    await session.commit()
    assert await outbound_block_reason(session, lead.email.upper(), inbox.id) == "archived"
    assert (await session.execute(select(QueueSlot.id))).scalars().all() == [claimed.id]
    assert await set_archived(session, [lead.id], True, user) == 0
    assert await set_archived(session, [lead.id], False, user) == 1
    await session.commit()
    assert lead.archived_at is None
    assert lead.status == "unsubscribed"
    assert await is_suppressed(session, lead.email)
    assert await session.get(EmailLog, mail.id) is mail
    assert await session.get(LeadReply, reply.id) is reply
    # Even a mailbox-level resume cannot silently re-enable archived enrollments.
    enrollment.sending_paused = False
    assert enrollment.archive_sending_paused
    assert await outbound_block_reason(session, lead.email, inbox.id, campaign_lead_id=enrollment.id) == "paused_contact"
    assert not campaign_lead_may_receive_sends(enrollment, lead)
    await session.flush()
    eligible = (await session.execute(select(CampaignLead.id).join(Lead).join(Campaign).where(
        campaign_lead_schedule_eligibility_clause()
    ))).scalars().all()
    assert eligible == []
    ops = (await session.execute(select(ContactOperation).order_by(ContactOperation.id))).scalars().all()
    assert [x.action for x in ops] == ["archive", "restore"]
    assert all(x.actor_id == user.id and x.actor_name == "operator" and x.occurred_at for x in ops)

@pytest.mark.asyncio
async def test_archive_route_scope_export_author_and_atomicity(session):
    user = await actor(session)
    lead = await make_lead(session)
    await session.commit()
    async def db_override():
        yield session
    old = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            invalid = await client.post('/api/leads/archive', json={'lead_ids':[lead.id,999999], 'archived':True})
            assert invalid.status_code == 404
            assert lead.archived_at is None
            result = await client.post('/api/leads/archive', json={'lead_ids':[lead.id], 'archived':True, 'actor_id':999})
            assert result.status_code == 200, result.text
            assert (await client.get('/api/leads')).json() == []
            archived = (await client.get('/api/leads?scope=archived')).json()
            assert [x['id'] for x in archived] == [lead.id]
            assert archived[0]['operations'][0]['actor_id'] == user.id
            assert (await client.get('/api/leads?scope=all')).json()[0]['id'] == lead.id
            assert (await client.get('/api/leads?scope=wrong')).status_code == 422
            assert lead.email not in (await client.get('/api/leads/export')).text
            assert lead.email in (await client.get('/api/leads/export?scope=archived')).text
            profile = (await client.get(f'/api/leads/{lead.id}')).json()
            assert profile['archived_at'] and not profile['suppressed']
            update = await client.patch(f'/api/leads/{lead.id}',json={'name':'Changed'})
            assert update.status_code == 200, update.text
            assert update.json()['operations'][0]['action'] == 'update'
            result = await client.post('/api/leads/archive',json={'lead_ids':[lead.id],'archived':False})
            assert result.status_code == 200
            assert (await client.get('/api/leads')).json()[0]['id'] == lead.id
            app.dependency_overrides.pop(get_current_user)
            assert (await client.post('/api/leads/archive',json={'lead_ids':[lead.id],'archived':True})).status_code == 401
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(old)

@pytest.mark.asyncio
async def test_archived_enrollment_and_recovery_cannot_reactivate(session):
    from fastapi import BackgroundTasks
    from app.routers.campaigns import bulk_add_leads_to_campaign, patch_campaign_lead
    from app.routers.leads import _mutate_lead_recover
    from app.schemas import CampaignLeadAdd, CampaignLeadEnrollmentPatch
    user = await actor(session)
    lead = await make_lead(session)
    campaign = await make_campaign(session)
    enrollment = await make_campaign_lead(session, campaign.id, lead.id)
    await set_archived(session, [lead.id], True, user)
    await session.commit()
    assert not campaign_lead_may_receive_sends(enrollment, lead)
    with pytest.raises(HTTPException, match='Restore'):
        await _mutate_lead_recover(lead, 'new@example.com', False)
    with pytest.raises(HTTPException, match='Restore'):
        await patch_campaign_lead(campaign.id, lead.id, CampaignLeadEnrollmentPatch(sending_paused=False), BackgroundTasks(), session)
    response = await bulk_add_leads_to_campaign(campaign.id, [CampaignLeadAdd(email=lead.email)], db=session)
    assert response['added'] == 0
    assert (await session.execute(select(func.count()).select_from(CampaignLead))).scalar() == 1

@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["bulk", "ordered", "round_robin"])
async def test_all_scheduler_paths_exclude_archive_and_restored_pause(session, method):
    from app.queue_logic import reserve_slots_for_new_leads_bulk, recalculate_queue_after_sequence_change_for_leads, recalculate_queue_round_robin
    from tests.conftest import make_campaign_inbox, make_sequence
    user = await actor(session)
    lead = await make_lead(session)
    campaign = await make_campaign(session)
    inbox = await make_inbox(session)
    await make_campaign_inbox(session, campaign.id, inbox.id)
    await make_sequence(session, campaign.id)
    enrollment = await make_campaign_lead(session, campaign.id, lead.id)
    for archived in (True, False):
        await set_archived(session, [lead.id], archived, user)
        await session.commit()
        if method == "bulk":
            await reserve_slots_for_new_leads_bulk(session, [enrollment.id], campaign.id)
        else:
            fn = recalculate_queue_after_sequence_change_for_leads if method == "ordered" else recalculate_queue_round_robin
            await fn(session, [enrollment.id])
        assert (await session.execute(select(func.count()).select_from(QueueSlot))).scalar() == 0
