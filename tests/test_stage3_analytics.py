from datetime import datetime as DT
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from app.models import LeadReply, CampaignLead, SmtpAccount, SmtpSyncState
from app.analytics_metrics import date_range
from app.routers.analytics import daily_analytics, recipient_report
from app.routers.campaigns import step_analytics
from app.routers import diagnostics as diag
from tests.conftest import make_campaign, make_inbox, make_lead, make_campaign_lead, make_email_log, make_sequence


@pytest.mark.parametrize('start,end',[('2026-01-02','2026-01-01'),('2025-01-01','2026-01-02'),('2026-02-30','2026-03-01'),('2026-1-1','2026-01-02'),('9999-12-31','9999-12-31')])
def test_date_rejects_invalid(start,end):
    with pytest.raises(HTTPException): date_range(start,end)


@pytest.mark.asyncio
async def test_daily_null_classification_duplicates_and_missing_enrollment(session):
    campaign=await make_campaign(session)
    a,b,c=[await make_lead(session,email=f'{i}@test.com') for i in range(3)]
    await make_campaign_lead(session,campaign.id,a.id)
    await make_campaign_lead(session,campaign.id,a.id) # legacy duplicate
    auto=await make_campaign_lead(session,campaign.id,b.id);auto.interest_status='auto_reply'
    for lead in [a,a,b,c]:session.add(LeadReply(lead_id=lead.id,campaign_id=campaign.id,replied_at=DT(2026,10,2)))
    await make_email_log(session,a.id,campaign.id,sent_at=DT(2026,10,1))
    await session.commit()
    rows=await daily_analytics('2026-10-01','2026-10-02',None,session)
    assert rows[0]['sent']==1
    assert rows[1]['total_replies']==2 # one contact/day, not enrollment or reply row count


@pytest.mark.asyncio
async def test_report_cohort_latest_send_status_and_current_field(session):
    campaign=await make_campaign(session)
    first=await make_inbox(session,email='first@test.com');second=await make_inbox(session,email='second@test.com')
    a=await make_lead(session);a.custom_data={'country':'PL'}
    cl=await make_campaign_lead(session,campaign.id,a.id);cl.enrollment_status='bounced'
    await make_email_log(session,a.id,campaign.id,inbox_id=first.id,sent_at=DT(2026,10,1,9))
    await make_email_log(session,a.id,campaign.id,inbox_id=second.id,sent_at=DT(2026,10,2,9))
    for stamp in [DT(2026,9,30),DT(2026,10,2,10),DT(2026,10,2,10),DT(2026,10,4)]:
        session.add(LeadReply(lead_id=a.id,campaign_id=campaign.id,replied_at=stamp))
    # Unenrolled historical contact remains in denominator; status rate must be unknown.
    b=await make_lead(session,email='b@test.com')
    await make_email_log(session,b.id,campaign.id,inbox_id=first.id,sent_at=DT(2026,10,2))
    # A reply to a send before this cohort must not be counted.
    c=await make_lead(session,email='c@test.com')
    await make_email_log(session,c.id,campaign.id,inbox_id=first.id,sent_at=DT(2026,9,29))
    session.add(LeadReply(lead_id=c.id,campaign_id=campaign.id,replied_at=DT(2026,10,2)))
    await session.commit()
    result=await recipient_report('2026-10-01','2026-10-02',None,'campaign',None,session)
    r=result['rows'][0]
    assert (r['sent'],r['recipients'],r['replied'],r['reply_rate'])==(3,2,1,50)
    assert r['bounce_rate'] is None and r['status_known']==1
    report=await recipient_report('2026-10-01','2026-10-02',None,'inbox',None,session)
    assert [(x['label'],x['replied']) for x in report['rows']]==[('first@test.com',0),('second@test.com',1)]
    report=await recipient_report('2026-10-01','2026-10-02',[campaign.id],'field','country',session)
    assert [(x['label'],x['recipients']) for x in report['rows']]==[(None,1),('PL',1)]
    assert report['rows'][1]['bounce_rate']==100
    assert (await recipient_report('2026-10-01','2026-10-02',[-1],'campaign',None,session))['rows']==[]


@pytest.mark.asyncio
async def test_step_reply_only_credits_last_preceding_message(session):
    c=await make_campaign(session);a=await make_lead(session)
    await make_campaign_lead(session,c.id,a.id)
    await make_sequence(session,c.id,position=0);await make_sequence(session,c.id,position=1)
    await make_email_log(session,a.id,c.id,sequence_index=0,sent_at=DT(2026,10,1))
    await make_email_log(session,a.id,c.id,sequence_index=1,sent_at=DT(2026,10,2))
    for _ in range(2):session.add(LeadReply(lead_id=a.id,campaign_id=c.id,replied_at=DT(2026,10,3)))
    await session.commit()
    result=await step_analytics(c.id,session)
    assert [r['total_replies'] for r in result]==[0,1]


@pytest.mark.asyncio
async def test_dns_errors_never_become_clean_blacklist(monkeypatch):
    mock=AsyncMock(side_effect=[{'state':'observed','records':['127.0.0.2']},{'state':'observed','records':['127.255.255.254']}])
    monkeypatch.setattr(diag,'dns_query',mock)
    assert (await diag.blacklist_check('8.8.8.8'))['state']=='error'
    mock.side_effect=[{'state':'missing','records':[]}]
    assert (await diag.blacklist_check('8.8.8.8'))['state']=='error'
    assert mock.await_count==3


def test_dns_presence_is_not_validation():
    assert diag.txt_result({'state':'error','records':[]},'v=spf1')['state']=='error'
    assert diag.txt_result({'state':'observed','records':['v=spf1 -all']},'v=spf1')['state']=='present'
    assert diag.txt_result({'state':'observed','records':['v=spf1 -all','v=spf1 ~all']},'v=spf1')['state']=='invalid'
    assert diag.txt_result({'state':'observed','records':['v=DKIM1; p=;']},'',dkim=True)['state']=='revoked'


@pytest.mark.asyncio
async def test_demo_and_unconfigured_domain_never_query_network(session,monkeypatch):
    await make_inbox(session,email='me@example.com')
    query=AsyncMock();monkeypatch.setattr(diag,'dns_query',query)
    request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(is_demo=True)))
    with pytest.raises(HTTPException) as ex:await diag.check_domain('example.com',diag.DomainCheck(),request,session)
    assert ex.value.status_code==403
    request.app.state.is_demo=False
    with pytest.raises(HTTPException) as ex:await diag.check_domain('other.com',diag.DomainCheck(),request,session)
    assert ex.value.status_code==404
    query.assert_not_awaited()


@pytest.mark.asyncio
async def test_domain_missing_inputs_null_mx_and_timeout(session,monkeypatch):
    await make_inbox(session,email='me@example.com')
    request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(is_demo=False)))
    async def query(name,kind):
        return {'state':'observed','records':['0 .']} if kind=='MX' else {'state':'error','records':[]}
    monkeypatch.setattr(diag,'dns_query',query)
    report=await diag.check_domain('example.com',diag.DomainCheck(),request,session)
    assert {key:value['state'] for key,value in report['checks'].items()}=={'SPF':'error','DMARC':'error','MX':'null_mx','DKIM':'not_measured','Blacklist':'not_measured'}
    with pytest.raises(HTTPException):await diag.check_domain('example.com',diag.DomainCheck(sending_ipv4='127.0.0.1'),request,session)


@pytest.mark.asyncio
async def test_mailbox_state_has_no_credentials_or_raw_errors(session):
    inbox=await make_inbox(session,provider='smtp')
    session.add(SmtpAccount(inbox_id=inbox.id,smtp_password='secret',last_test_ok=True))
    session.add(SmtpSyncState(inbox_id=inbox.id,last_error='secret failure'))
    await session.commit()
    req=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(is_demo=True)))
    result=await diag.mailbox_diagnostics(req,session)
    assert result['rows'][0]['connection_test']=='not_measured'
    assert result['rows'][0]['sync_state']=='error'
    assert 'secret' not in str(result)


@pytest.mark.asyncio
async def test_changing_connection_invalidates_test_but_noop_save_keeps_it(session):
    from app.routers import smtp
    from tests.test_smtp import _valid_payload
    inbox=await make_inbox(session,provider='smtp')
    await smtp.upsert_smtp_account(inbox.id,smtp.SmtpAccountUpsert(**_valid_payload()),session,object())
    from sqlalchemy import select
    account=(await session.execute(select(SmtpAccount).where(SmtpAccount.inbox_id==inbox.id))).scalar_one()
    account.last_tested_at=DT(2026,10,1);account.last_test_ok=True
    await session.commit()
    saved=await smtp.upsert_smtp_account(inbox.id,smtp.SmtpAccountUpsert(**_valid_payload(smtp_password='')),session,object())
    assert saved['last_tested_at'] and saved['last_test_ok']
    saved=await smtp.upsert_smtp_account(inbox.id,smtp.SmtpAccountUpsert(**_valid_payload(smtp_host='new.example.com',smtp_password='')),session,object())
    assert saved['last_tested_at'] is None and not saved['last_test_ok']
