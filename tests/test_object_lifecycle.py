import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from app.models import Campaign, Lead, EmailLog, User
from app.schemas import CampaignUpdate
from app.routers.campaigns import update_campaign, delete_campaign, _campaign_preflight
from app.routers.sales import activities
from app.sales_models import SalesActivity, Pipeline, Opportunity
from app.crm_models import Company
from app.crm import protect_delete
from tests.conftest import make_campaign, make_lead, make_email_log


@pytest.mark.asyncio
async def test_unresolved_send_blocks_campaign_and_contact_deletion(session):
    from app.models import QueueSlot, SendAttempt
    from tests.conftest import make_campaign_lead, make_inbox, make_queue_slot

    campaign = await make_campaign(session, paused=True)
    lead = await make_lead(session)
    enrollment = await make_campaign_lead(session, campaign.id, lead.id)
    inbox = await make_inbox(session)
    slot = await make_queue_slot(session, enrollment.id, inbox.id)
    attempt = SendAttempt(queue_slot_id=slot.id, attempt_token='uncertain-lifecycle')
    session.add(attempt)
    await session.commit()

    for operation in (lambda: delete_campaign(campaign.id, db=session),
                      lambda: protect_delete(session, [lead.id])):
        with pytest.raises(HTTPException) as exc:
            await operation()
        assert exc.value.status_code == 409
        assert 'unresolved send attempt' in exc.value.detail

    # Archiving must preserve the claim that prevents an automatic duplicate send.
    await update_campaign(campaign.id, CampaignUpdate(archived=True), BackgroundTasks(), db=session)
    from app.routers.schedule import recalculate_all_campaigns
    await recalculate_all_campaigns(session)
    assert await session.get(SendAttempt, attempt.id)
    assert await session.get(QueueSlot, slot.id)

    unrelated = await make_campaign(session, paused=True)
    assert await delete_campaign(unrelated.id, db=session) == {'ok': True}


@pytest.mark.asyncio
@pytest.mark.parametrize('strategy', ['priority', 'round_robin'])
async def test_recalculation_preserves_uncertain_delivery_and_schedules_other_contacts(session, strategy):
    from app.models import QueueSlot, SendAttempt
    from app.app_settings import put_setting
    from app.routers.schedule import recalculate_all_campaigns
    from tests.conftest import make_campaign_lead, make_inbox, make_queue_slot, make_sequence, make_campaign_inbox

    await put_setting(session, 'scheduling_strategy', strategy)
    campaign = await make_campaign(session, paused=False)
    inbox = await make_inbox(session)
    await make_campaign_inbox(session, campaign.id, inbox.id)
    await make_sequence(session, campaign.id)
    first = await make_lead(session)
    second = await make_lead(session)
    claimed = await make_campaign_lead(session, campaign.id, first.id)
    other = await make_campaign_lead(session, campaign.id, second.id)
    slot = await make_queue_slot(session, claimed.id, inbox.id)
    session.add(SendAttempt(queue_slot_id=slot.id, attempt_token='recalc-lifecycle'))
    await session.commit()
    await recalculate_all_campaigns(session)
    slots = list((await session.execute(select(QueueSlot))).scalars())
    assert [s.id for s in slots if s.campaign_lead_id == claimed.id] == [slot.id]
    assert any(s.campaign_lead_id == other.id for s in slots)
    assert await session.scalar(select(SendAttempt.id).where(SendAttempt.queue_slot_id == slot.id))

@pytest.mark.asyncio
async def test_archive_restore_keeps_sending_paused_and_preserves_history(session):
    c=await make_campaign(session,paused=False);l=await make_lead(session)
    log=await make_email_log(session,l.id,c.id);await session.commit()
    result=await update_campaign(c.id,CampaignUpdate(archived=True),BackgroundTasks(),db=session)
    assert result.archived and result.paused
    assert await session.get(EmailLog,log.id)
    report=await _campaign_preflight(session,c.id)
    assert any(x['code']=='campaign_archived' for x in report['issues'])
    with pytest.raises(HTTPException) as ex:
        await update_campaign(c.id,CampaignUpdate(paused=False),BackgroundTasks(),db=session)
    assert ex.value.status_code==409
    result=await update_campaign(c.id,CampaignUpdate(archived=False),BackgroundTasks(),db=session)
    assert not result.archived and result.paused
    with pytest.raises(HTTPException) as ex:await delete_campaign(c.id,db=session)
    assert ex.value.status_code==409
    with pytest.raises(HTTPException):await protect_delete(session,[l.id])
    assert await session.get(Lead,l.id)

@pytest.mark.asyncio
async def test_activity_names_include_archived_original_relations(session):
    from datetime import datetime
    l=await make_lead(session,name='Anna');l.archived_at=datetime(2026,1,1)
    company=Company(name='Marina',archived_at=datetime(2026,1,1));p=Pipeline(name='Sales',stages=[{'key':'new','name':'New'}]);session.add_all([company,p]);await session.flush()
    deal=Opportunity(title='Contract',pipeline_id=p.id,stage='new',lead_id=l.id,company_id=company.id,archived_at=datetime(2026,1,1));session.add(deal);await session.flush()
    activity=SalesActivity(title='Meeting',kind='task',due_at=datetime(2026,11,1),lead_id=l.id,company_id=company.id,opportunity_id=deal.id);session.add(activity);await session.flush()
    response=await activities(offset=0,limit=100,db=session)
    row=response['items'][0]
    assert (row['lead_name'],row['company_name'],row['opportunity_title'])==('Anna','Marina','Contract')
