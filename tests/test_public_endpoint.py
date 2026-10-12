import secrets
import pytest
from fastapi.testclient import TestClient
from public_endpoint.server import Store, create_apps

KEY='k'*48
SUBJECT='a'*64

def endpoint(tmp_path):
    store=Store(tmp_path/'endpoint.db')
    public,sync=create_apps(store,[KEY])
    return store,TestClient(public),TestClient(sync,headers={'Authorization':'Bearer '+KEY})


def test_listener_isolation_and_immutable_registration(tmp_path):
    store,pub,api=endpoint(tmp_path)
    epoch=api.get('/v1/status').json()['epoch']
    token=secrets.token_urlsafe(32)
    body={'epoch':epoch,'items':[{'kind':'click','token':token,'subject':SUBJECT,'target':'https://example.org/a'}]}
    assert pub.post('/v1/register',json=body).status_code==404
    assert api.get('/docs').status_code==404
    assert api.get('/v1/status',headers={'Authorization':'bad'}).status_code==401
    assert api.post('/v1/register',json=body).status_code==200
    body['items'][0]['target']='https://example.org/b'
    assert api.post('/v1/register',json=body).status_code==409
    r=pub.get('/c/'+token,follow_redirects=False)
    assert r.status_code==302 and r.headers['location']=='https://example.org/a'
    body['items'][0].update(token=secrets.token_urlsafe(32),target='file:///etc/passwd')
    assert api.post('/v1/register',json=body).status_code==422
    assert pub.get('/c/unknown').status_code==404


def test_unsubscribe_durable_confirmed_idempotent_and_ack(tmp_path):
    store,pub,api=endpoint(tmp_path)
    epoch=api.get('/v1/status').json()['epoch']
    token=secrets.token_urlsafe(32)
    assert api.post('/v1/register',json={'epoch':epoch,'items':[{'kind':'unsubscribe','token':token,'subject':SUBJECT}]}).status_code==200
    assert pub.get('/u/'+token).status_code==200
    assert api.post('/v1/check',json={'epoch':epoch,'subjects':[SUBJECT]}).json()['blocked']==[]
    assert pub.post('/u/'+token).status_code==200
    assert pub.post('/u/'+token).status_code==200
    events=api.get('/v1/events',params={'epoch_id':epoch}).json()['events']
    assert len(events)==1
    _,restarted=create_apps(Store(tmp_path/'endpoint.db'),[KEY])
    api=TestClient(restarted,headers={'Authorization':'Bearer '+KEY})
    assert api.post('/v1/check',json={'epoch':epoch,'subjects':[SUBJECT]}).json()['blocked']==[SUBJECT]
    cursor=events[0]['id']
    assert api.post('/v1/ack',json={'epoch':epoch,'cursor':cursor+1}).status_code==409
    assert api.post('/v1/ack',json={'epoch':epoch,'cursor':cursor}).status_code==200
    assert api.get('/v1/events',params={'epoch_id':epoch,'after':cursor}).json()['events']==[]
    assert api.get('/v1/events',params={'epoch_id':epoch,'after':0}).status_code==409
    assert api.post('/v1/check',json={'epoch':'wrong','subjects':[]}).status_code==409


def test_tracking_limit_never_discards_unsubscribe(tmp_path,monkeypatch):
    monkeypatch.setenv('ENDPOINT_TRACKING_QUEUE_LIMIT','0')
    _,pub,api=endpoint(tmp_path)
    epoch=api.get('/v1/status').json()['epoch']
    a,b=secrets.token_urlsafe(32),secrets.token_urlsafe(32)
    api.post('/v1/register',json={'epoch':epoch,'items':[{'kind':'open','token':a,'subject':SUBJECT},{'kind':'unsubscribe','token':b,'subject':SUBJECT}]})
    assert pub.get('/o/'+a).status_code==200
    assert pub.post('/u/'+b).status_code==200
    assert [e['kind'] for e in api.get('/v1/events',params={'epoch_id':epoch}).json()['events']]==['unsubscribe']


def test_private_mode_checks_placeholders(monkeypatch,tmp_path):
    import json
    from types import SimpleNamespace
    from app.endpoint_client import validate_content
    from app.app_settings import get_inbox_tracking_base
    path=tmp_path/'client.json';path.write_text(json.dumps({'mode':'private','endpoints':[]}))
    monkeypatch.setenv('SEKARO_ENDPOINT_CONFIG',str(path))
    campaign=SimpleNamespace(track_opens=False,track_clicks=False)
    validate_content(campaign,'Hello')
    with pytest.raises(ValueError):validate_content(campaign,'{{ unsubscribe_link }}')
    campaign.track_opens=True
    with pytest.raises(ValueError):validate_content(campaign,'Hello')
    assert get_inbox_tracking_base(SimpleNamespace(id=1),'https://private.test')==''


@pytest.mark.asyncio
async def test_application_sync_replay_outage_and_volume_loss(session,tmp_path,monkeypatch):
    import json
    import httpx
    from app import endpoint_client as ec
    from app.models import LeadUnsubscribeToken, EndpointCursor, EmailLog
    from app.suppression import is_suppressed
    from tests.conftest import make_campaign,make_lead,make_email_log
    store,pub,api=endpoint(tmp_path)
    _,sync=create_apps(store,[KEY])
    epoch=api.get('/v1/status').json()['epoch']
    config=tmp_path/'client.json'
    config.write_text(json.dumps({'mode':'unsubscribe','endpoints':[{'id':'test','epoch':epoch,'public_url':'https://public.example','sync_url':'http://sync.test','transport':'mesh','key_file':'unused','inbox_ids':[]}]}))
    monkeypatch.setenv('SEKARO_ENDPOINT_CONFIG',str(config))
    monkeypatch.setenv('SEKARO_ENDPOINT_SUBJECT_KEY','stable-subject-key'*4)
    monkeypatch.setattr(ec,'client',lambda p:httpx.AsyncClient(transport=httpx.ASGITransport(app=sync),base_url='http://sync.test',headers={'Authorization':'Bearer '+KEY}))
    campaign=await make_campaign(session)
    lead=await make_lead(session)
    token=secrets.token_urlsafe(32)
    session.add(LeadUnsubscribeToken(lead_id=lead.id,campaign_id=campaign.id,token=token))
    log=await make_email_log(session,lead.id,campaign.id)
    await session.commit()
    profile=ec.profile_for(1)
    r=api.post('/v1/register',json={'epoch':epoch,'items':[{'kind':'unsubscribe','token':token,'subject':ec.subject_for(lead.email)},{'kind':'open','token':log.open_token,'subject':ec.subject_for(lead.email)}]})
    assert r.status_code==200,r.text
    pub.get('/o/'+log.open_token)
    pub.post('/u/'+token)
    # Simulate the response/ACK failing after the application transaction commits.
    original=ec.request
    async def fail_ack(c,method,path,**kwargs):
        if path=='/v1/ack': raise OSError('network down')
        return await original(c,method,path,**kwargs)
    monkeypatch.setattr(ec,'request',fail_ack)
    with pytest.raises(OSError):await ec.sync_endpoint(session,profile)
    assert await is_suppressed(session,lead.email)
    assert (await session.get(EndpointCursor,'test')).cursor==2
    monkeypatch.setattr(ec,'request',original)
    await ec.sync_endpoint(session,profile)
    from app.models import EmailOpen
    from sqlalchemy import select,func
    assert await session.scalar(select(func.count(EmailOpen.id)))==1
    assert await ec.before_send(session,lead.email,1)=='suppressed'
    # A newly initialized endpoint is never accepted as the old queue.
    _,fresh=create_apps(Store(tmp_path/'lost.db'),[KEY])
    monkeypatch.setattr(ec,'client',lambda p:httpx.AsyncClient(transport=httpx.ASGITransport(app=fresh),base_url='http://sync.test',headers={'Authorization':'Bearer '+KEY}))
    assert await ec.before_send(session,'another@example.org',1)=='endpoint_unavailable'

@pytest.mark.asyncio
async def test_final_guard_does_not_commit_draft_and_sees_late_unsubscribe(session,tmp_path,monkeypatch):
    import httpx
    from sqlalchemy import select,func
    from app import endpoint_client as ec
    from app.models import EmailLog,LeadUnsubscribeToken
    from tests.conftest import make_campaign,make_lead
    store,pub,api=endpoint(tmp_path)
    _,sync=create_apps(store,[KEY])
    epoch=api.get('/v1/status').json()['epoch']
    p={'id':'one','epoch':epoch,'inbox_ids':[]}
    monkeypatch.setattr(ec,'configuration',lambda:{'mode':'unsubscribe','endpoints':[p]})
    monkeypatch.setattr(ec,'subject_for',lambda email:SUBJECT)
    monkeypatch.setattr(ec,'client',lambda p:httpx.AsyncClient(transport=httpx.ASGITransport(app=sync),base_url='http://sync.test',headers={'Authorization':'Bearer '+KEY}))
    campaign=await make_campaign(session);lead=await make_lead(session)
    token=secrets.token_urlsafe(32)
    session.add(LeadUnsubscribeToken(lead_id=lead.id,campaign_id=campaign.id,token=token))
    await session.commit()
    assert await ec.before_send(session,lead.email,1) is None
    session.add(EmailLog(lead_id=lead.id,campaign_id=campaign.id,subject='draft',message_id=''))
    await session.flush()
    assert await ec.before_send(session,lead.email,1,synchronize=False) is None
    await session.rollback()
    assert await session.scalar(select(func.count(EmailLog.id)))==0
    api.post('/v1/register',json={'epoch':epoch,'items':[{'kind':'unsubscribe','token':token,'subject':SUBJECT}]})
    pub.post('/u/'+token)
    assert await ec.before_send(session,'lead@example.test',1,synchronize=False)=='suppressed'


@pytest.mark.asyncio
async def test_retired_endpoint_checked_only_for_previously_associated_recipient(session,monkeypatch):
    from app import endpoint_client as ec
    from app.models import EndpointSubject
    p={'id':'old','epoch':'x','retired':True}
    monkeypatch.setattr(ec,'configuration',lambda:{'mode':'private','endpoints':[p]})
    monkeypatch.setattr(ec,'subject_for',lambda email:SUBJECT)
    async def down(*args):raise OSError('offline')
    monkeypatch.setattr(ec,'sync_endpoint',down)
    assert await ec.before_send(session,'new@example.test',1) is None
    session.add(EndpointSubject(endpoint_id='old',subject=SUBJECT));await session.commit()
    assert await ec.before_send(session,'old@example.test',1)=='endpoint_unavailable'


@pytest.mark.asyncio
async def test_migration_preserves_old_short_open_and_unsubscribe_tokens(session,tmp_path,monkeypatch):
    import httpx
    from app import endpoint_client as ec
    from app.models import LeadUnsubscribeToken,TrackedLink
    from tests.conftest import make_campaign,make_lead,make_inbox,make_email_log
    store,pub,api=endpoint(tmp_path);_,sync=create_apps(store,[KEY])
    epoch=api.get('/v1/status').json()['epoch']
    p={'id':'migrated','epoch':epoch,'inbox_ids':[]}
    monkeypatch.setattr(ec,'configuration',lambda:{'mode':'tracking','endpoints':[p]})
    monkeypatch.setattr(ec,'subject_for',lambda email:SUBJECT)
    monkeypatch.setattr(ec,'client',lambda p:httpx.AsyncClient(transport=httpx.ASGITransport(app=sync),base_url='http://sync.test',headers={'Authorization':'Bearer '+KEY}))
    c=await make_campaign(session);lead=await make_lead(session);inbox=await make_inbox(session)
    log=await make_email_log(session,lead.id,c.id,inbox_id=inbox.id)
    log.open_token='old_token11'
    token=secrets.token_urlsafe(32);click=secrets.token_urlsafe(32)
    session.add(LeadUnsubscribeToken(lead_id=lead.id,campaign_id=c.id,token=token))
    session.add(TrackedLink(email_log_id=log.id,token=click,original_url='https://example.org/old'))
    await session.commit()
    await ec.migrate_existing()
    assert pub.get('/o/old_token11').status_code==200
    assert pub.get('/c/'+click,follow_redirects=False).headers['location']=='https://example.org/old'
    assert pub.post('/u/'+token).status_code==200
    await ec.migrate_existing() # repeat import cannot overwrite or duplicate mappings
    await ec.sync_endpoint(session,p)
    from app.suppression import is_suppressed
    assert await is_suppressed(session,lead.email)


def test_invalid_redirect_and_large_body_are_rejected(tmp_path):
    _,pub,api=endpoint(tmp_path)
    epoch=api.get('/v1/status').json()['epoch']
    body={'epoch':epoch,'items':[{'kind':'click','token':secrets.token_urlsafe(32),'subject':SUBJECT,'target':'https://[broken'}]}
    assert api.post('/v1/register',json=body).status_code==422
    assert api.post('/v1/register',content=b'x'*1048577).status_code==413
    assert pub.get('/api/users').status_code==404
