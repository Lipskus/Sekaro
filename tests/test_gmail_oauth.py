"""Private Gmail connection boundaries, using real auth and mocked Google only."""
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
import httpx
import pytest
from sqlalchemy import select, text
from app.main import app
from app.auth import create_access_token
from app.database import get_db
from app.models import User, Inbox, GmailAccount, OAuthState
from app.routers import gmail_private as gmail
from app import security

@pytest.fixture
async def client(session, monkeypatch):
    admin=User(username='gmail_admin',email='admin@example.com',role='admin',is_active=True)
    other=User(username='gmail_other',email='other@example.com',role='admin',is_active=True)
    member=User(username='gmail_member',email='member@example.com',role='user',is_active=True)
    session.add_all([admin,other,member]);await session.commit()
    monkeypatch.setattr(gmail.settings,'google_client_id','client')
    monkeypatch.setattr(gmail.settings,'google_client_secret','secret')
    monkeypatch.setattr(gmail.settings,'base_url','https://sekaro.example.com')
    monkeypatch.delenv('SEKARO_DEMO_MODE',raising=False)
    old_key=security._fernet;security.init_encryption('test-key-only')
    old=dict(app.dependency_overrides)
    async def db():yield session
    app.dependency_overrides[get_db]=db
    async def exchange(code,uri):
        return {'access_token':'access-secret','refresh_token':'refresh-secret','scope':gmail.SCOPE,'expires_in':3600},'mail@example.com'
    monkeypatch.setattr(gmail,'exchange',exchange)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test') as c:
        yield c,admin,other,member
    app.dependency_overrides.clear();app.dependency_overrides.update(old);security._fernet=old_key

def auth(user):return {'Authorization':'Bearer '+create_access_token(user.id,user.role)}
async def start(c,user,**body):
    r=await c.post('/api/gmail/authorize',json=body,headers=auth(user));assert r.status_code==200,r.text
    return parse_qs(urlparse(r.json()['url']).query)['state'][0]
async def finish(c,user,state,**params):
    return await c.get('/api/gmail/callback',params={'state':state,'code':'mock-code',**params},headers=auth(user))

@pytest.mark.asyncio
async def test_private_routes_and_demo(client,monkeypatch):
    c,a,o,u=client
    assert (await c.get('/api/gmail/status')).status_code==401
    assert (await c.get('/api/gmail/status',headers=auth(u))).status_code==403
    for path in ('/oauth/google/callback','/api/gmail/accounts','/api/oauth/connect-url'):
        assert (await c.get(path,headers=auth(a))).status_code==404
    monkeypatch.setenv('SEKARO_DEMO_MODE','1')
    assert (await c.post('/api/gmail/authorize',headers=auth(a),json={})).status_code==403
    assert (await c.get('/api/gmail/status',headers=auth(a))).json()['demo'] is True

@pytest.mark.asyncio
async def test_connection_paused_encrypted_and_single_use(client,session):
    c,a,o,u=client;state=await start(c,a)
    assert (await finish(c,o,state)).status_code==400
    result=await finish(c,a,state);assert result.status_code==303,result.text
    inbox=await session.scalar(select(Inbox).where(Inbox.email=='mail@example.com'))
    assert inbox.provider=='gmail' and inbox.paused
    row=(await session.execute(text('select access_token, refresh_token from gmail_account'))).one()
    assert security.is_encrypted(row[0]) and security.is_encrypted(row[1])
    assert security.decrypt(row[1])=='refresh-secret'
    assert (await finish(c,a,state)).status_code==400
    status=(await c.get('/api/gmail/status',headers=auth(a))).json()
    assert 'access-secret' not in str(status) and 'refresh-secret' not in str(status)
    assert status['accounts'][0]['email']=='mail@example.com'

@pytest.mark.asyncio
async def test_no_implicit_conversion_or_wrong_reconnect(client,session):
    c,a,o,u=client
    smtp=Inbox(email='mail@example.com',provider='smtp',paused=False)
    existing=Inbox(email='different@example.com',provider='gmail',paused=True)
    session.add_all([smtp,existing]);await session.commit()
    assert (await c.post('/api/gmail/authorize',json={'inbox_id':smtp.id},headers=auth(a))).status_code==409
    assert (await finish(c,a,await start(c,a))).status_code==409
    assert (await finish(c,a,await start(c,a,inbox_id=existing.id))).status_code==409
    await session.refresh(smtp);assert smtp.provider=='smtp' and smtp.paused is False
    assert await session.scalar(select(GmailAccount.id)) is None

@pytest.mark.asyncio
async def test_expired_cancelled_and_failed_grants_consumed(client,session,monkeypatch):
    c,a,o,u=client;state=await start(c,a)
    row=await session.scalar(select(OAuthState).where(OAuthState.state_token==state));row.expires_at=datetime.utcnow()-timedelta(seconds=1);await session.commit()
    assert (await finish(c,a,state)).status_code==400
    state=await start(c,a)
    assert (await finish(c,a,state,error='access_denied')).status_code==303
    assert (await finish(c,a,state)).status_code==400
    from fastapi import HTTPException
    async def failed(*args):raise HTTPException(502,'Google unavailable')
    monkeypatch.setattr(gmail,'exchange',failed)
    state=await start(c,a)
    assert (await finish(c,a,state)).status_code==502
    assert (await finish(c,a,state)).status_code==400
    assert await session.scalar(select(GmailAccount.id)) is None

@pytest.mark.asyncio
async def test_configuration_required_and_reconnect_preserves_mailbox(client,session,monkeypatch):
    c,a,o,u=client
    monkeypatch.setattr(security,'_fernet',None)
    assert (await c.post('/api/gmail/authorize',json={},headers=auth(a))).status_code==409
    security.init_encryption('test-key-only')
    assert (await finish(c,a,await start(c,a))).status_code==303
    inbox=await session.scalar(select(Inbox));inbox.display_name='Keep name';inbox.max_emails_per_day=17;await session.commit()
    assert (await finish(c,a,await start(c,a,inbox_id=inbox.id))).status_code==303
    await session.refresh(inbox)
    assert inbox.display_name=='Keep name' and inbox.max_emails_per_day==17 and inbox.paused

@pytest.mark.asyncio
async def test_exchange_rejects_missing_scope_and_refresh_token(monkeypatch):
    class Response:
        def raise_for_status(self):pass
        def json(self):return {'access_token':'secret','scope':gmail.SCOPE}
    class MockClient:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,*args,**kwargs):return Response()
    monkeypatch.setattr(gmail.httpx,'AsyncClient',MockClient)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:await gmail.exchange('code','https://test')
    assert error.value.status_code==502 and 'secret' not in error.value.detail

@pytest.mark.asyncio
async def test_refresh_failure_does_not_return_expired_token(session,monkeypatch):
    from app import unibox
    from types import SimpleNamespace
    async def credentials(db):return 'id','secret'
    monkeypatch.setattr(unibox,'get_google_oauth_credentials',credentials)
    monkeypatch.setattr(unibox,'refresh_access_token',lambda *args:None)
    from unittest.mock import AsyncMock
    monkeypatch.setattr(unibox,'maybe_fire_email_event',AsyncMock())
    account=SimpleNamespace(inbox_id=1,token_expiry=datetime.utcnow()-timedelta(hours=1),access_token='expired')
    with pytest.raises(RuntimeError,match='Could not refresh'):
        await unibox._ensure_access_token(session,account)
    assert account.access_token=='expired'
