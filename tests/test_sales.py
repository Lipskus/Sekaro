from datetime import datetime, timedelta, timezone
import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from app.main import app
from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.crm_models import CrmProfile
from app.sales_models import Opportunity, SalesActivity
from app.crm import merge_preview, merge_contacts, protect_delete
from app.outbound_safety import outbound_block_reason
from app.suppression import suppress_email
from tests.conftest import make_lead, make_campaign, make_campaign_lead, make_inbox

@pytest.fixture
async def sales_client(session):
    actor=User(username='seller',email='seller@example.com');session.add(actor);await session.commit()
    async def db():yield session
    old=dict(app.dependency_overrides);app.dependency_overrides[get_db]=db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.get('/api/crm/sales/opportunities')).status_code==401
        app.dependency_overrides[get_current_user]=lambda:actor
        yield client,actor
    app.dependency_overrides.clear();app.dependency_overrides.update(old)

async def pipeline(client):
    response=await client.post('/api/crm/sales/pipelines',json={'name':'Sales','stages':[{'key':'new','name':'New'},{'key':'offer','name':'Offer'}]})
    assert response.status_code==201,response.text
    return response.json()

def deal(p,**extra):return dict(title='Deal',pipeline_id=p['id'],stage='new',value='1250.50',currency='PLN',probability=40,**extra)

@pytest.mark.asyncio
async def test_deal_cycle_does_not_change_sending_and_rejects_stale_edits(sales_client,session):
    client,actor=sales_client;p=await pipeline(client)
    lead=await make_lead(session);campaign=await make_campaign(session);inbox=await make_inbox(session)
    membership=await make_campaign_lead(session,campaign.id,lead.id);await suppress_email(session,lead.email,stop_active_sends=False);await session.commit()
    lead_id=lead.id
    body=deal(p,lead_id=lead_id);r=await client.post('/api/crm/sales/opportunities',json=body);assert r.status_code==201,r.text
    row=r.json();id=row['id'];assert row['value']=='1250.50'
    for outcome in ['won','lost','open']:
        body.update(revision=row['revision'],outcome=outcome,outcome_reason='Test',stage='offer')
        r=await client.put(f'/api/crm/sales/opportunities/{id}',json=body);assert r.status_code==200,r.text;row=r.json()
        assert bool(row['closed_at'])==(outcome!='open')
        assert await outbound_block_reason(session,lead.email,inbox.id)=='suppressed'
        assert not membership.sending_paused
    stale=await client.put(f'/api/crm/sales/opportunities/{id}',json=body);assert stale.status_code==409
    await session.rollback()
    history=(await client.get(f'/api/crm/sales/history/opportunity/{id}')).json()
    assert len(history)==4 and all(h['actor_name']=='seller' for h in history)
    assert (await client.post('/api/crm/sales/opportunities',json=deal(p,outcome='lost'))).status_code==422
    with pytest.raises(HTTPException) as ex:await protect_delete(session,[lead_id])
    assert ex.value.status_code==409

@pytest.mark.asyncio
async def test_pipeline_used_stages_cannot_disappear_and_archive_blocks_new(sales_client):
    client,_=sales_client;p=await pipeline(client)
    assert (await client.post('/api/crm/sales/opportunities',json=deal(p))).status_code==201
    r=await client.put('/api/crm/sales/pipelines/'+str(p['id']),json={'name':'Edited','revision':1,'stages':[{'key':'offer','name':'Offer'}]});assert r.status_code==409
    r=await client.put('/api/crm/sales/pipelines/'+str(p['id']),json={'name':'Edited','revision':1,'archived':True,'stages':[{'key':'new','name':'Renamed'},{'key':'offer','name':'Offer'}]});assert r.status_code==200,r.text
    assert (await client.post('/api/crm/sales/opportunities',json=deal(p))).status_code==409

@pytest.mark.asyncio
async def test_activity_times_reminders_snooze_and_completion(sales_client):
    client,_=sales_client;now=datetime.now(timezone.utc)
    body=dict(title='Meeting',kind='meeting',starts_at=(now-timedelta(hours=2)).isoformat(),due_at=(now-timedelta(hours=1)).isoformat(),reminder_at=(now-timedelta(hours=3)).isoformat())
    bad={**body,'due_at':body['starts_at']};assert (await client.post('/api/crm/sales/activities',json=bad)).status_code==422
    bad={**body,'due_at':'2026-10-05T12:00:00'};assert (await client.post('/api/crm/sales/activities',json=bad)).status_code==422
    r=await client.post('/api/crm/sales/activities',json=body);assert r.status_code==201,r.text;row=r.json()
    result=(await client.get('/api/crm/sales/activities')).json()['items'][0];assert result['overdue'] and result['reminder_due']
    body.update(revision=row['revision'],snoozed_until=(now+timedelta(days=1)).isoformat())
    r=await client.put('/api/crm/sales/activities/'+str(row['id']),json=body);assert r.status_code==200,r.text;row=r.json()
    result=(await client.get('/api/crm/sales/activities')).json()['items'][0];assert result['overdue'] and not result['reminder_due']
    body.update(revision=row['revision'],status='done');assert (await client.put('/api/crm/sales/activities/'+str(row['id']),json=body)).status_code==200
    result=(await client.get('/api/crm/sales/activities')).json()['items'][0];assert not result['overdue'] and not result['reminder_due']

@pytest.mark.asyncio
async def test_merge_keeps_sales_original_ids_and_survivor_filter(sales_client,session):
    client,actor=sales_client;p=await pipeline(client)
    a=await make_lead(session,email='a@example.com',name='A');b=await make_lead(session,email='b@example.com',name='B')
    session.add_all([CrmProfile(lead_id=a.id,kind='person'),CrmProfile(lead_id=b.id,kind='person')]);await session.commit()
    r=await client.post('/api/crm/sales/opportunities',json=deal(p,lead_id=b.id));assert r.status_code==201,r.text;id=r.json()['id']
    preview=await merge_preview(session,a.id,b.id);await merge_contacts(session,a.id,b.id,preview['fingerprint'],{'name':'target'},actor);await session.commit()
    rows=(await client.get('/api/crm/sales/opportunities',params={'lead_id':a.id})).json()['items'];assert len(rows)==1 and rows[0]['lead_id']==b.id
    assert (await session.get(Opportunity,id)).lead_id==b.id
    assert (await client.post('/api/crm/sales/opportunities',json=deal(p,lead_id=b.id))).status_code==409

@pytest.mark.asyncio
async def test_calendar_overlap_context_and_stale_completion(sales_client,session):
    client,_=sales_client;p=await pipeline(client);lead=await make_lead(session)
    opportunity=(await client.post('/api/crm/sales/opportunities',json=deal(p,lead_id=lead.id))).json()
    body=dict(title='Across months',kind='meeting',starts_at='2026-10-31T23:30:00+01:00',due_at='2026-11-01T02:00:00+01:00',opportunity_id=opportunity['id'])
    row=(await client.post('/api/crm/sales/activities',json=body)).json()
    boundary={**body,'title':'Ends at boundary','due_at':'2026-11-01T00:00:00Z'}
    assert (await client.post('/api/crm/sales/activities',json=boundary)).status_code==201
    response=await client.get('/api/crm/sales/activities',params={'lead_id':lead.id,'date_from':'2026-11-01T00:00:00Z','date_to':'2026-12-01T00:00:00Z'})
    assert response.status_code==200 and response.json()['total']==1
    assert response.json()['items'][0]['starts_at']=='2026-10-31T22:30:00Z'
    assert (await client.get('/api/crm/sales/activities',params={'date_from':'2026-12-01T00:00:00Z'})).json()['total']==0
    assert (await client.get('/api/crm/sales/activities',params={'date_from':'2026-12-01T00:00:00Z','date_to':'2026-11-01T00:00:00Z'})).status_code==422
    body.update(revision=row['revision'],status='done')
    assert (await client.put(f"/api/crm/sales/activities/{row['id']}",json=body)).status_code==200
    body['status']='planned'
    assert (await client.put(f"/api/crm/sales/activities/{row['id']}",json=body)).status_code==409
    history=(await client.get(f"/api/crm/sales/history/activity/{row['id']}")).json()
    assert len(history)==2 and history[0]['changes']['after']['status']=='done'

@pytest.mark.asyncio
async def test_additive_schema_upgrade_is_repeatable_and_preserves_existing_contact():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import insert, inspect
    from app.database import Base
    from app.models import Lead
    from app.sales_models import Pipeline, SalesEvent
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    sales_tables={x.__table__ for x in (Pipeline,Opportunity,SalesActivity,SalesEvent)}
    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda c:Base.metadata.create_all(c,tables=[t for t in Base.metadata.sorted_tables if t not in sales_tables]))
            await conn.execute(insert(Lead).values(id=123,email='existing@example.com',name='Existing'))
            for _ in range(2):await conn.run_sync(Base.metadata.create_all)
            assert (await conn.execute(select(Lead.email).where(Lead.id==123))).scalar_one()=='existing@example.com'
            tables=await conn.run_sync(lambda c:inspect(c).get_table_names())
            assert all(t.name in tables for t in sales_tables)
    finally:await engine.dispose()
