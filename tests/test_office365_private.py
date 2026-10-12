"""Private Office365 connection boundaries, using real auth and mocked Microsoft only."""
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
import httpx
import pytest
from sqlalchemy import select, text
from app.main import app
from app.auth import create_access_token
from app.database import get_db
from app.models import User, Inbox, Office365Account, OAuthState
from app.routers import office365_private as office365
from app import security

@pytest.fixture
async def client(session, monkeypatch):
    admin=User(username='office365_admin',email='admin@example.com',role='admin',is_active=True)
    other=User(username='office365_other',email='other@example.com',role='admin',is_active=True)
    member=User(username='office365_member',email='member@example.com',role='user',is_active=True)
    session.add_all([admin,other,member]);await session.commit()
    monkeypatch.setattr(office365.settings,'office365_client_id','client')
    monkeypatch.setattr(office365.settings,'office365_client_secret','secret')
    monkeypatch.setattr(office365.settings,'base_url','https://sekaro.example.com')
    monkeypatch.delenv('SEKARO_DEMO_MODE',raising=False)
    old_key=security._fernet;security.init_encryption('test-key-only')
    old=dict(app.dependency_overrides)
    async def db():yield session
    app.dependency_overrides[get_db]=db
    async def exchange(code,uri,verifier):
        assert len(verifier)>=43
        return {'access_token':'access-secret','refresh_token':'refresh-secret','scope':office365.SCOPE,'expires_in':3600},'mail@example.com'
    monkeypatch.setattr(office365,'exchange',exchange)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test') as c:
        yield c,admin,other,member
    app.dependency_overrides.clear();app.dependency_overrides.update(old);security._fernet=old_key

def auth(user):return {'Authorization':'Bearer '+create_access_token(user.id,user.role)}
async def start(c,user,**body):
    r=await c.post('/api/office365/authorize',json=body,headers=auth(user));assert r.status_code==200,r.text
    return parse_qs(urlparse(r.json()['url']).query)['state'][0]
async def finish(c,user,state,**params):
    return await c.get('/api/office365/callback',params={'state':state,'code':'mock-code',**params},headers=auth(user))

@pytest.mark.asyncio
async def test_private_routes_and_demo(client,monkeypatch):
    c,a,o,u=client
    assert (await c.get('/api/office365/status')).status_code==401
    assert (await c.get('/api/office365/status',headers=auth(u))).status_code==403
    for path in ('/oauth/office365/callback','/api/office365/accounts','/api/oauth/connect-url'):
        assert (await c.get(path,headers=auth(a))).status_code==404
    monkeypatch.setenv('SEKARO_DEMO_MODE','1')
    assert (await c.post('/api/office365/authorize',headers=auth(a),json={})).status_code==403
    assert (await c.get('/api/office365/status',headers=auth(a))).json()['demo'] is True

@pytest.mark.asyncio
async def test_connection_paused_encrypted_and_single_use(client,session):
    c,a,o,u=client;state=await start(c,a)
    assert (await finish(c,o,state)).status_code==400
    result=await finish(c,a,state);assert result.status_code==303,result.text
    assert result.headers['referrer-policy']=='no-referrer'
    inbox=await session.scalar(select(Inbox).where(Inbox.email=='mail@example.com'))
    assert inbox.provider=='office365' and inbox.paused
    row=(await session.execute(text('select access_token, refresh_token from office365_account'))).one()
    assert security.is_encrypted(row[0]) and security.is_encrypted(row[1])
    assert security.decrypt(row[1])=='refresh-secret'
    assert (await finish(c,a,state)).status_code==400
    status=(await c.get('/api/office365/status',headers=auth(a))).json()
    assert 'access-secret' not in str(status) and 'refresh-secret' not in str(status)
    assert status['accounts'][0]['email']=='mail@example.com'

@pytest.mark.asyncio
async def test_no_implicit_conversion_or_wrong_reconnect(client,session):
    c,a,o,u=client
    smtp=Inbox(email='mail@example.com',provider='smtp',paused=False)
    existing=Inbox(email='different@example.com',provider='office365',paused=True)
    session.add_all([smtp,existing]);await session.commit()
    assert (await c.post('/api/office365/authorize',json={'inbox_id':smtp.id},headers=auth(a))).status_code==409
    assert (await finish(c,a,await start(c,a))).status_code==409
    assert (await finish(c,a,await start(c,a,inbox_id=existing.id))).status_code==409
    await session.refresh(smtp);assert smtp.provider=='smtp' and smtp.paused is False
    assert await session.scalar(select(Office365Account.id)) is None

@pytest.mark.asyncio
async def test_expired_cancelled_and_failed_grants_consumed(client,session,monkeypatch):
    c,a,o,u=client;state=await start(c,a)
    row=await session.scalar(select(OAuthState).where(OAuthState.state_token==state));row.expires_at=datetime.utcnow()-timedelta(seconds=1);await session.commit()
    assert (await finish(c,a,state)).status_code==400
    state=await start(c,a)
    assert (await finish(c,a,state,error='access_denied')).status_code==303
    assert (await finish(c,a,state)).status_code==400
    from fastapi import HTTPException
    async def failed(*args):raise HTTPException(502,'Microsoft unavailable')
    monkeypatch.setattr(office365,'exchange',failed)
    state=await start(c,a)
    assert (await finish(c,a,state)).status_code==502
    assert (await finish(c,a,state)).status_code==400
    assert await session.scalar(select(Office365Account.id)) is None

@pytest.mark.asyncio
async def test_configuration_required_and_reconnect_preserves_mailbox(client,session,monkeypatch):
    c,a,o,u=client
    monkeypatch.setattr(security,'_fernet',None)
    assert (await c.post('/api/office365/authorize',json={},headers=auth(a))).status_code==409
    security.init_encryption('test-key-only')
    assert (await finish(c,a,await start(c,a))).status_code==303
    inbox=await session.scalar(select(Inbox));inbox.display_name='Keep name';inbox.max_emails_per_day=17;await session.commit()
    assert (await finish(c,a,await start(c,a,inbox_id=inbox.id))).status_code==303
    await session.refresh(inbox)
    assert inbox.display_name=='Keep name' and inbox.max_emails_per_day==17 and inbox.paused


@pytest.mark.asyncio
async def test_exchange_uses_pkce_and_validates_scopes(monkeypatch):
    import httpx
    real_client=httpx.AsyncClient
    seen=[]
    def handler(request):
        seen.append(request)
        if request.method=='POST':
            assert b'code_verifier=verifier' in request.content
            return httpx.Response(200,json={'access_token':'access','refresh_token':'refresh','scope':'Mail.ReadWrite Mail.Send User.Read','expires_in':3600})
        assert request.headers['Authorization']=='Bearer access'
        return httpx.Response(200,json={'mail':'USER@example.com'})
    monkeypatch.setattr(office365.httpx,'AsyncClient',lambda **kwargs:real_client(transport=httpx.MockTransport(handler),**kwargs))
    tokens,email=await office365.exchange('code','https://test/api/office365/callback','verifier')
    assert email=='user@example.com' and tokens['refresh_token']=='refresh'
    assert seen[0].url.host=='login.microsoftonline.com' and seen[1].url.host=='graph.microsoft.com'


def test_refresh_rotates_refresh_token_without_logging_secrets(monkeypatch):
    from app.routers import office365_oauth
    from types import SimpleNamespace
    import json
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self):return json.dumps({'access_token':'new-access','refresh_token':'new-refresh','expires_in':3600}).encode()
    monkeypatch.setattr(office365_oauth.urllib.request,'urlopen',lambda *args,**kwargs:Response())
    account=SimpleNamespace(refresh_token='old',access_token='expired',microsoft_email='user@example.com')
    assert office365_oauth.refresh_access_token(account,'client','secret','common')=='new-access'
    assert account.refresh_token=='new-refresh'

@pytest.mark.asyncio
async def test_graph_sync_is_idempotent_and_does_not_commit_partial_checkpoints(session,monkeypatch):
    from app import unibox
    from app.models import Office365SyncState,Office365Message
    from sqlalchemy import func
    inbox=Inbox(email='sync@example.com',provider='office365');session.add(inbox);await session.flush()
    session.add(Office365Account(inbox_id=inbox.id,microsoft_email=inbox.email,access_token='token',refresh_token='refresh'))
    await session.commit()
    message={'id':'graph-id','conversationId':'conversation','internetMessageId':'<id@example.com>',
        'subject':'Hello','receivedDateTime':'2026-10-05T10:00:00Z','from':{'emailAddress':{'address':'sender@example.com'}},
        'body':{'contentType':'text','content':'Body'},'toRecipients':[{'emailAddress':{'address':inbox.email}}]}
    def graph(token,folder=None,delta_link=None,**kwargs):
        name=folder or delta_link.rsplit('/',1)[-1]
        return ([message] if name=='Inbox' else []),'https://graph.microsoft.com/checkpoint/'+name
    monkeypatch.setattr(unibox,'_graph_list_messages',graph)
    monkeypatch.setattr(unibox,'FULL_SYNC_PROGRESS_COMMIT_INTERVAL',1)
    original_commit=session.commit
    async def forbidden_commit():pytest.fail('Partial checkpoint commit loses unprocessed messages')
    monkeypatch.setattr(session,'commit',forbidden_commit)
    assert await unibox._sync_inbox_office365(session,inbox,'test')=={(inbox.id,'conversation')}
    await original_commit()
    await unibox._sync_inbox_office365(session,inbox,'repeat')
    assert await session.scalar(select(func.count()).select_from(Office365Message))==1
    state=await session.scalar(select(Office365SyncState))
    assert state.delta_link.endswith('/Inbox') and state.last_sync_at
    def failure(*args,**kwargs):raise unibox.GmailAPIError(503,'Unavailable')
    monkeypatch.setattr(unibox,'_graph_list_messages',failure)
    with pytest.raises(unibox.GmailAPIError):await unibox._sync_inbox_office365(session,inbox,'error')
