"""Exercise transactional event capture, repeat processing, approval and delivery boundaries."""
from datetime import timedelta
from decimal import Decimal
import pytest
from fastapi import HTTPException
from sqlalchemy import select,func
from app.models import User,LeadReply,CampaignLead,QueueSlot
from app.time import utcnow
from app.sales_models import Pipeline,Opportunity,SalesActivity,SalesEvent
from app.automation_models import AutomationRule,AutomationEvent,AutomationRun,AutomationAudit,ContactTag
from app.routers.automation import create,toggle,update,scan,decide,rule_preview,RuleBody,Toggle,Decision
from app.automation import process_rule,execute
from app.routers.sales import event,data
from app.suppression import suppress_email,is_suppressed
from tests.conftest import make_lead,make_campaign,make_campaign_lead,make_email_log,make_inbox

async def setup(db,mode='approval',action=None,trigger='reply',conditions=None,limit=100):
    actor=User(username='automation-editor',email='automation@example.com');db.add(actor)
    lead=await make_lead(db);campaign=await make_campaign(db,paused=True)
    rule=await create(RuleBody(name='Follow-up',trigger=trigger,mode=mode,action=action or {'type':'task','title':'Call customer','delay_days':1},conditions=conditions or {},daily_limit=limit),db,actor)
    return actor,lead,campaign,rule
async def enable(db,actor,rule):return await toggle(rule['id'],Toggle(revision=rule['revision'],enabled=True),db,actor)
async def reply(db,lead,campaign):
    db.add(LeadReply(lead_id=lead.id,campaign_id=campaign.id));await db.commit()

@pytest.mark.asyncio
async def test_preview_no_mutation_approval_exactly_once_and_suppression(session):
    actor,lead,campaign,rule=await setup(session)
    await reply(session,lead,campaign)
    preview=await rule_preview(rule['id'],session)
    assert preview['items'][0]['plan']['eligible']
    assert await session.scalar(select(func.count()).select_from(AutomationRun))==0
    await enable(session,actor,rule);await scan(session,actor)
    assert await session.scalar(select(func.count()).select_from(AutomationRun))==0 # no history replay
    await suppress_email(session,lead.email,stop_active_sends=False);await reply(session,lead,campaign)
    await scan(session,actor);await scan(session,actor)
    run=await session.scalar(select(AutomationRun))
    assert run.state=='pending' and await session.scalar(select(func.count()).select_from(SalesActivity))==0
    await decide(run.id,Decision(revision=1,action='approve'),session,actor)
    assert run.state=='succeeded'
    with pytest.raises(HTTPException):await decide(run.id,Decision(revision=1,action='approve'),session,actor)
    assert await session.scalar(select(func.count()).select_from(SalesActivity))==1
    assert await is_suppressed(session,lead.email) and campaign.paused
    assert await session.scalar(select(func.count()).select_from(QueueSlot))==0
    assert await session.scalar(select(func.count()).select_from(AutomationEvent))==2 # generated task no loop

@pytest.mark.asyncio
async def test_pause_stale_definition_and_archived_contact_are_rechecked(session):
    actor,lead,campaign,rule=await setup(session,action={'type':'tag','tag':'Interested'})
    await enable(session,actor,rule);await reply(session,lead,campaign);await scan(session,actor)
    run=await session.scalar(select(AutomationRun))
    await toggle(rule['id'],Toggle(revision=1,enabled=False),session,actor)
    with pytest.raises(HTTPException):await decide(run.id,Decision(revision=1,action='approve'),session,actor)
    await enable(session,actor,rule);lead.archived_at=utcnow();await session.commit()
    await decide(run.id,Decision(revision=1,action='approve'),session,actor)
    assert run.state=='skipped'
    assert await session.scalar(select(func.count()).select_from(ContactTag))==0
    await toggle(rule['id'],Toggle(revision=1,enabled=False),session,actor)
    body=RuleBody(name='Changed',trigger='reply',action={'type':'tag','tag':'New'},revision=1)
    await update(rule['id'],body,session,actor)
    with pytest.raises(HTTPException):await update(rule['id'],body,session,actor)

@pytest.mark.asyncio
async def test_automatic_daily_limit_and_restart_ledger(session):
    actor,lead,campaign,rule=await setup(session,mode='automatic',limit=1)
    await enable(session,actor,rule)
    await reply(session,lead,campaign);await reply(session,lead,campaign)
    await scan(session,actor)
    runs=(await session.scalars(select(AutomationRun).order_by(AutomationRun.id))).all()
    assert [x.state for x in runs]==['succeeded','pending']
    session.expire_all()
    await scan(session,actor)
    assert await session.scalar(select(func.count()).select_from(SalesActivity))==1
    assert await session.scalar(select(func.count()).select_from(AutomationRun))==2

@pytest.mark.asyncio
async def test_completion_event_is_transactional(session):
    actor,lead,campaign,rule=await setup(session,trigger='enrollment_completed')
    cl=await make_campaign_lead(session,campaign.id,lead.id);await session.commit();await enable(session,actor,rule)
    cl.enrollment_status='completed';await session.flush();await session.flush()
    assert await session.scalar(select(func.count()).select_from(AutomationEvent))==1
    await session.rollback()
    assert await session.scalar(select(func.count()).select_from(AutomationEvent))==0

@pytest.mark.asyncio
async def test_overdue_collection_ignores_old_and_generated_activities(session):
    actor,lead,campaign,rule=await setup(session,trigger='activity_overdue')
    await enable(session,actor,rule)
    r=await session.get(AutomationRule,rule['id']);r.activated_at=utcnow()-timedelta(days=2)
    for days,title in [(3,'old'),(1,'new')]:session.add(SalesActivity(kind='task',title=title,lead_id=lead.id,due_at=utcnow()-timedelta(days=days)))
    await session.commit();await scan(session,actor);await scan(session,actor)
    assert await session.scalar(select(func.count()).select_from(AutomationRun))==1
    run=await session.scalar(select(AutomationRun));activity=await session.get(SalesActivity,run.payload['activity_id']);activity.status='done';await session.commit()
    await decide(run.id,Decision(revision=1,action='approve'),session,actor)
    assert run.state=='skipped' and run.result['reason']=='no_longer_overdue'

@pytest.mark.asyncio
async def test_move_stage_audit_and_no_recursive_event(session):
    p=Pipeline(name='Sales',stages=[{'key':'new','name':'New'},{'key':'offer','name':'Offer'}]);session.add(p);await session.flush()
    actor,lead,campaign,rule=await setup(session,mode='automatic',trigger='opportunity_changed',conditions={'pipeline_id':p.id},action={'type':'move_stage','stage':'offer'})
    await enable(session,actor,rule)
    deal=Opportunity(title='Deal',pipeline_id=p.id,stage='new',lead_id=lead.id,value=Decimal('10'));session.add(deal);await session.flush()
    before=data(deal);deal.probability=40;deal.stage='offer';deal.revision+=1;await session.flush();event(session,deal,'opportunity',actor,before);await session.commit()
    await scan(session,actor);await scan(session,actor)
    assert await session.scalar(select(func.count()).select_from(AutomationRun))==1
    assert await session.scalar(select(func.count()).select_from(AutomationEvent))==1
    assert await session.scalar(select(func.count()).select_from(AutomationAudit).where(AutomationAudit.action=='succeeded'))==1

@pytest.mark.asyncio
async def test_failure_rolls_back_effect_and_retry_uses_same_run(session,monkeypatch):
    import app.routers.sales as sales
    actor,lead,campaign,rule=await setup(session);await enable(session,actor,rule);await reply(session,lead,campaign);await scan(session,actor)
    run=await session.scalar(select(AutomationRun));original=sales.data
    def fail(row):raise RuntimeError('Internal secret must not reach API')
    monkeypatch.setattr(sales,'data',fail)
    await decide(run.id,Decision(revision=1,action='approve'),session,actor)
    assert run.state=='failed' and run.result=={'reason':'action_failed'}
    assert await session.scalar(select(func.count()).select_from(SalesActivity))==0
    monkeypatch.setattr(sales,'data',original)
    await decide(run.id,Decision(revision=1,action='retry'),session,actor)
    assert run.state=='succeeded' and run.attempts==2
    assert await session.scalar(select(func.count()).select_from(SalesActivity))==1

@pytest.mark.asyncio
async def test_private_api_and_stale_proposal(session):
    import httpx
    from app.main import app
    from app.auth import get_current_user
    from app.database import get_db
    actor,lead,campaign,rule=await setup(session)
    await enable(session,actor,rule);await reply(session,lead,campaign);await scan(session,actor)
    run=await session.scalar(select(AutomationRun));rid=run.id
    await toggle(rule['id'],Toggle(revision=1,enabled=False),session,actor)
    await update(rule['id'],RuleBody(name='New version',trigger='reply',action={'type':'tag','tag':'Later'},revision=1),session,actor)
    await toggle(rule['id'],Toggle(revision=2,enabled=True),session,actor)
    with pytest.raises(HTTPException) as exc:await decide(rid,Decision(revision=2,action='approve'),session,actor)
    assert exc.value.status_code==409
    async def db():yield session
    old=dict(app.dependency_overrides);app.dependency_overrides[get_db]=db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            for url in ['/api/crm/automations/rules','/api/crm/automations/runs','/api/crm/reports']:
                assert (await client.get(url)).status_code==401
            assert (await client.post('/api/crm/automations/scan',json={})).status_code==401
            app.dependency_overrides[get_current_user]=lambda:actor
            assert (await client.get('/api/crm/reports')).status_code==200
            r=await client.post('/api/crm/automations/rules',json={'name':'Unsafe','trigger':'reply','action':{'type':'send_email'}})
            assert r.status_code==422
            assert (await client.post(f'/api/crm/automations/runs/{rid}/decision',json={'revision':2,'action':'reject'})).status_code==200
    finally:app.dependency_overrides.clear();app.dependency_overrides.update(old)

@pytest.mark.asyncio
async def test_additive_tables_upgrade_existing_schema_twice():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import inspect
    from app.database import Base
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    new_names={'crm_automation_rule','crm_automation_event','crm_automation_run','crm_automation_audit','crm_contact_tag'}
    async with engine.begin() as conn:
        await conn.run_sync(lambda c:Base.metadata.create_all(c,tables=[t for t in Base.metadata.sorted_tables if t.name not in new_names]))
        await conn.run_sync(Base.metadata.create_all);await conn.run_sync(Base.metadata.create_all)
        names=await conn.run_sync(lambda c:set(inspect(c).get_table_names()))
        assert new_names<=names
    await engine.dispose()

@pytest.mark.asyncio
async def test_late_committed_lower_event_id_is_not_lost(session):
    actor,lead,campaign,rule=await setup(session,action={'type':'tag','tag':'Seen'})
    await enable(session,actor,rule)
    session.add(AutomationEvent(id=100,source_key='later-id',trigger='reply',payload={'lead_id':lead.id,'campaign_id':campaign.id}));await session.commit();await scan(session,actor)
    session.add(AutomationEvent(id=50,source_key='earlier-id-committed-later',trigger='reply',payload={'lead_id':lead.id,'campaign_id':campaign.id}));await session.commit();await scan(session,actor)
    assert set((await session.scalars(select(AutomationRun.event_id))).all())=={50,100}
