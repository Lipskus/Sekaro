from datetime import timedelta,timezone
from decimal import Decimal
import pytest
from fastapi import HTTPException
from app.time import utcnow
from app.sales_models import Pipeline,Opportunity,SalesActivity
from app.crm_models import CrmProfile
from app.routers.crm_reports import report
from tests.conftest import make_lead,make_campaign,make_inbox,make_email_log

async def get_report(db,**kw):
    args=dict(date_from=None,date_to=None,date_basis='created',pipeline_id=None,campaign_id=None,inbox_id=None,custom_field='',custom_value='',inactive_days=30,db=db);args.update(kw)
    return await report(**args)

@pytest.mark.asyncio
async def test_report_separates_currencies_and_has_one_source_per_merged_identity(session):
    lead=await make_lead(session,email='root@example.com');old=await make_lead(session,email='old@example.com')
    session.add(CrmProfile(lead_id=old.id,kind='person',merged_into=lead.id));lead.custom_data={'region':'Baltic'}
    p=Pipeline(name='Sales',stages=[{'key':'offer','name':'Offer'}]);session.add(p);await session.flush()
    c1=await make_campaign(session,name='Earlier');c2=await make_campaign(session,name='Latest');inbox=await make_inbox(session)
    now=utcnow();sent=now-timedelta(days=2)
    await make_email_log(session,lead.id,c1.id,inbox_id=inbox.id,sent_at=sent)
    await make_email_log(session,old.id,c2.id,inbox_id=inbox.id,sent_at=sent) # tie -> higher ID
    for currency,outcome,value in [('PLN','won','100'),('EUR','open','200'),('PLN','lost','50')]:
        session.add(Opportunity(title=currency+outcome,pipeline_id=p.id,stage='offer',lead_id=lead.id,value=Decimal(value),currency=currency,outcome=outcome,created_at=now-timedelta(days=1),closed_at=now if outcome!='open' else None))
    await session.commit()
    r=await get_report(session,custom_field='region',custom_value='Baltic')
    assert r['counts']=={'open':1,'won':1,'lost':1}
    assert r['conversion']=={'numerator':1,'denominator':2,'percent':50}
    assert len(r['sources'])==2 and {s['campaign_id'] for s in r['sources']}=={c2.id}
    assert sum(s['count'] for s in r['sources'])==3
    assert r['currencies']==[{'currency':'EUR','open':'200.00','won':'0','lost':'0'},{'currency':'PLN','open':'0','won':'100.00','lost':'50.00'}]
    assert (await get_report(session,campaign_id=c1.id))['definitions']['total_opportunities']==0
    assert (await get_report(session,date_basis='closed'))['counts']['open']==0

@pytest.mark.asyncio
async def test_dates_are_half_open_and_followup_respects_linked_activity(session):
    lead=await make_lead(session);p=Pipeline(name='P',stages=[{'key':'new','name':'New'}]);session.add(p);await session.flush()
    now=utcnow();deal=Opportunity(title='Old',pipeline_id=p.id,stage='new',lead_id=lead.id,created_at=now,updated_at=now-timedelta(days=40));session.add(deal);await session.flush()
    session.add(SalesActivity(kind='task',title='Linked task',opportunity_id=deal.id,due_at=now-timedelta(hours=1)))
    await session.commit();r=await get_report(session)
    assert len(r['inactive'])==1 and len(r['overdue'])==1 and r['followup']==[]
    assert r['conversion']['percent'] is None
    assert (await get_report(session,date_to=now.replace(tzinfo=timezone.utc)))['counts']['open']==0
    assert (await get_report(session,date_from=now.replace(tzinfo=timezone.utc)))['counts']['open']==1
    with pytest.raises(HTTPException):await get_report(session,date_from=now)
    with pytest.raises(HTTPException):await get_report(session,date_from=now.replace(tzinfo=timezone.utc),date_to=now.replace(tzinfo=timezone.utc))
