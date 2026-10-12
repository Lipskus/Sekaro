import pytest
import httpx
from sqlalchemy import select
from app.main import app
from app.database import get_db
from app.models import User, APIKey
from app.auth import create_access_token,create_refresh_token,hash_api_key
from app.access import UserAccess,AccessRole,AccessTeam,AccessMember,AccessAudit,permissions_for

@pytest.fixture
async def access_client(session):
    admin=User(username='access_admin',email='access_admin@example.com',role='admin',is_active=True)
    member=User(username='access_member',email='access_member@example.com',role='user',is_active=True)
    session.add_all([admin,member]);await session.flush();session.add(UserAccess(user_id=member.id,revision=1));await session.commit()
    async def db():yield session
    old=dict(app.dependency_overrides);app.dependency_overrides[get_db]=db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test') as client:
        yield client,admin,member
    app.dependency_overrides.clear();app.dependency_overrides.update(old)

def token(user):return {'Authorization':'Bearer '+create_access_token(user.id,user.role)}

@pytest.mark.asyncio
async def test_roles_enforced_on_real_jwt_and_key_and_change_immediately(access_client,session):
    c,a,u=access_client
    assert (await c.get('/api/access')).status_code==401
    assert (await c.get('/api/access',headers=token(u))).status_code==403
    assert (await c.get('/api/leads',headers=token(u))).status_code==403
    r=await c.post('/api/access/roles',headers=token(a),json={'name':'CRM read','permissions':['crm.read']});assert r.status_code==201,r.text
    role_id=r.json()['id']
    r=await c.put(f'/api/access/users/{u.id}',headers=token(a),json={'role_id':role_id,'administrator':False,'active':True,'revision':1});assert r.status_code==200,r.text
    bearer=token(u)
    assert (await c.get('/api/leads',headers=bearer)).status_code==200
    assert (await c.post('/api/crm/sales/activities',headers=bearer,json={})).status_code==403
    assert (await c.get('/api/settings/webhooks',headers=bearer)).status_code==403
    assert (await c.get('/api/campaigns',headers=bearer)).status_code==403
    session.add(APIKey(user_id=u.id,name='key',prefix='key',key_hash=hash_api_key('test-key'),scopes=[]));await session.commit()
    assert (await c.get('/api/leads',headers={'X-API-Key':'test-key'})).status_code==200
    assert (await c.post('/api/leads',headers={'X-API-Key':'test-key'},json={})).status_code==403
    r=await c.put(f'/api/access/roles/{role_id}',headers=token(a),json={'name':'CRM read','permissions':[],'revision':1});assert r.status_code==200,r.text
    assert (await c.get('/api/leads',headers=bearer)).status_code==403
    assert (await c.get('/api/leads',headers={'X-API-Key':'test-key'})).status_code==403
    assert (await c.get('/api/auth/me',headers=bearer)).json()['permissions']==[]

@pytest.mark.asyncio
async def test_team_roles_and_revision_and_audit(access_client,session):
    c,a,u=access_client;h=token(a)
    role=(await c.post('/api/access/roles',headers=h,json={'name':'CRM editor','permissions':['crm.read','crm.write']})).json()['id']
    team=await c.post('/api/access/teams',headers=h,json={'name':'Sales','role_id':role,'members':[u.id]});assert team.status_code==201,team.text
    assert await permissions_for(session,u)=={'crm.read','crm.write'}
    payload={'name':'Sales','role_id':None,'members':[],'revision':1}
    r=await c.put('/api/access/teams/'+str(team.json()['id']),headers=h,json=payload);assert r.status_code==200,r.text
    assert await permissions_for(session,u)==set()
    assert (await c.put('/api/access/teams/'+str(team.json()['id']),headers=h,json=payload)).status_code==409
    audit=(await c.get('/api/access/audit',headers=h)).json();assert len(audit)==3
    assert all(x['actor_name']==a.username for x in audit)
    assert 'password' not in str(audit)
    assert (await c.post('/api/access/roles',headers=h,json={'name':'Invalid','permissions':['crm.write']})).status_code==422
    assert (await c.post('/api/access/roles',headers=h,json={'name':'Invalid','permissions':['admin']})).status_code==422

@pytest.mark.asyncio
async def test_disable_reactivate_revokes_old_sessions_and_keys(access_client,session):
    c,a,u=access_client;h=token(a);old=token(u);refresh=create_refresh_token(u.id,u.role)
    session.add(APIKey(user_id=u.id,name='old',prefix='old',key_hash=hash_api_key('old-key'),scopes=[]));await session.commit()
    r=await c.put(f'/api/access/users/{u.id}',headers=h,json={'active':False,'revision':1});assert r.status_code==200,r.text
    assert (await c.get('/api/auth/me',headers=old)).status_code==401
    r=await c.put(f'/api/access/users/{u.id}',headers=h,json={'active':True,'revision':2});assert r.status_code==200,r.text
    assert (await c.get('/api/auth/me',headers=old)).status_code==401
    assert (await c.get('/api/auth/me',headers={'X-API-Key':'old-key'})).status_code==401
    c.cookies.set('refresh_token',refresh)
    assert (await c.post('/api/auth/refresh')).status_code==401
    assert (await c.get('/api/auth/me',headers=token(u))).status_code==200
    assert (await c.put(f'/api/access/users/{a.id}',headers=h,json={'administrator':False,'revision':0})).status_code==409

@pytest.mark.asyncio
async def test_new_user_least_privilege_and_no_secrets_in_audit(access_client):
    c,a,u=access_client;h=token(a)
    body={'username':'new_user','email':'new@example.com','password':'Secure123!'}
    r=await c.post('/api/access/users',headers=h,json=body);assert r.status_code==201,r.text
    assert r.json()['permissions']==[] and not r.json()['administrator']
    audit=(await c.get('/api/access/audit',headers=h)).json();assert body['password'] not in str(audit)
    r=await c.post('/api/auth/users',headers=h,json={'username':'legacy_create','email':'legacy@example.com','password':'Secure123!'});assert r.status_code==201,r.text
    users=(await c.get('/api/access',headers=h)).json()['users'];assert next(x for x in users if x['username']=='legacy_create')['permissions']==[]

@pytest.mark.asyncio
async def test_explicit_revocation_preserves_legacy_access_and_rejects_stale_edit(access_client,session):
    c,a,u=access_client
    legacy=User(username='legacy_existing',email='existing@example.com',role='user',is_active=True)
    session.add(legacy);await session.commit();old=token(legacy)
    before=await permissions_for(session,legacy)
    r=await c.post(f'/api/access/users/{legacy.id}/revoke-sessions',headers=token(a),json={'revision':0});assert r.status_code==200,r.text
    assert await permissions_for(session,legacy)==before
    assert (await c.get('/api/auth/me',headers=old)).status_code==401
    assert (await c.get('/api/auth/me',headers=token(legacy))).status_code==200
    assert (await c.put(f'/api/access/users/{legacy.id}',headers=token(a),json={'revision':0})).status_code==409

@pytest.mark.asyncio
async def test_module_boundaries_cover_ui_export_and_automation(access_client,session):
    c,a,u=access_client
    reader=AccessRole(name='CRM reader',permissions=['crm.read']);session.add(reader);await session.flush()
    access=await session.get(UserAccess,u.id);access.role_id=reader.id;await session.commit();h=token(u)
    assert (await c.get('/api/leads/export',headers=h)).status_code==200
    assert (await c.post('/api/ui/contacts',headers=h,json={})).status_code==403
    assert (await c.post('/api/ui/reply',headers=h,json={})).status_code==403
    assert (await c.post('/api/crm/automations/scan',headers=h)).status_code==403
    assert (await c.post('/api/access/teams',headers=h,json={})).status_code==403
    assert (await c.get('/api/auth/users',headers=h)).status_code==403
    # A team never bypasses administrator-only settings or identity management.
    reader.permissions=list(__import__('app.access',fromlist=['PERMISSIONS']).PERMISSIONS);await session.commit()
    assert (await c.get('/api/settings/webhooks',headers=h)).status_code==403
    assert (await c.get('/api/access',headers=h)).status_code==403
