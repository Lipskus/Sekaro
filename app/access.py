"""Installation-wide module permissions. Teams grant roles, not tenant isolation."""
from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey, Boolean, select
from fastapi import HTTPException
from app.database import Base
from app.time import utcnow

MODULES = ('crm', 'outreach', 'mail', 'reports', 'templates', 'automation')
PERMISSIONS = tuple(f'{m}.{a}' for m in MODULES for a in ('read','write'))

class AccessRole(Base):
    __tablename__='access_role'
    id=Column(Integer,primary_key=True)
    name=Column(String(120),nullable=False,unique=True)
    permissions=Column(JSON,nullable=False,default=list)
    revision=Column(Integer,nullable=False,default=1)

class AccessTeam(Base):
    __tablename__='access_team'
    id=Column(Integer,primary_key=True)
    name=Column(String(120),nullable=False,unique=True)
    role_id=Column(Integer,ForeignKey('access_role.id',ondelete='RESTRICT'),nullable=True)
    revision=Column(Integer,nullable=False,default=1)

class AccessMember(Base):
    __tablename__='access_member'
    team_id=Column(Integer,ForeignKey('access_team.id',ondelete='CASCADE'),primary_key=True)
    user_id=Column(Integer,ForeignKey('app_user.id',ondelete='RESTRICT'),primary_key=True)

class UserAccess(Base):
    __tablename__='user_access'
    user_id=Column(Integer,ForeignKey('app_user.id',ondelete='RESTRICT'),primary_key=True)
    role_id=Column(Integer,ForeignKey('access_role.id',ondelete='RESTRICT'),nullable=True)
    revision=Column(Integer,nullable=False,default=1)
    tokens_after=Column(DateTime,nullable=True)

class AccessAudit(Base):
    __tablename__='access_audit'
    id=Column(Integer,primary_key=True)
    actor_id=Column(Integer,ForeignKey('app_user.id',ondelete='RESTRICT'))
    actor_name=Column(String(150),nullable=False)
    action=Column(String(80),nullable=False)
    detail=Column(JSON,nullable=False)
    at=Column(DateTime,default=utcnow,nullable=False)

async def permissions_for(db,user):
    if user.role=='admin': return set(PERMISSIONS)
    access=await db.get(UserAccess,user.id)
    # Preserve existing ordinary users' business-module access on upgrade.
    if access is None: return set(PERMISSIONS) if user.role=='user' else set()
    role_ids=set((await db.execute(select(AccessTeam.role_id).join(AccessMember,AccessMember.team_id==AccessTeam.id).where(AccessMember.user_id==user.id))).scalars())
    role_ids.add(access.role_id);role_ids.discard(None)
    result=set()
    if role_ids:
        for values in (await db.execute(select(AccessRole.permissions).where(AccessRole.id.in_(role_ids)))).scalars(): result.update(values)
    return result & set(PERMISSIONS)

def required_permissions(path,method):
    """Unknown authenticated paths are administrator-only, including configuration."""
    path=path.rstrip('/')
    if path in ('/api/auth/me','/api/auth/change-password') or path.startswith('/api/notifications'):
        return set()
    if method in ('GET','HEAD') and path in ('/api/status','/api/settings/test-mode','/api/settings/time-offset','/api/settings/scheduling-strategy','/api/settings/webhooks/events'):
        return set()
    if path.startswith('/api/crm/automations/contacts/') and path.endswith('/tags') and method in ('GET','HEAD'):return {'crm.read'}
    module=None
    for prefix,m in [('/api/crm/automations','automation'),('/api/crm/reports','reports'),('/api/crm','crm'),('/api/leads','crm'),('/api/contact-fields','crm'),('/api/campaigns','outreach'),('/api/schedule','outreach'),('/api/inboxes','mail'),('/api/smtp','mail'),('/api/unibox','mail'),('/api/templates','templates'),('/api/analytics','reports'),('/api/ui/unibox','mail'),('/api/ui/reply','mail'),('/api/ui/contacts','crm')]:
        if path==prefix or path.startswith(prefix+'/'): module=m;break
    if module is None:return None
    required={module+'.read'}
    if method not in ('GET','HEAD','OPTIONS'):required.add(module+'.write')
    # Automations can inspect and change CRM; outreach endpoints expose contacts/mailboxes.
    if module=='automation':required.add('crm.read');required.update({'crm.write'} if method not in ('GET','HEAD','OPTIONS') else set())
    if module=='outreach':required.update({'crm.read','mail.read'})
    return required

async def authorize(db,user,request):
    if user.role=='admin':return
    required=required_permissions(request.url.path,request.method)
    if required is None or not required <= await permissions_for(db,user):
        raise HTTPException(403,'Permission denied')

async def check_token_epoch(db,user,payload):
    from datetime import timezone
    access=await db.get(UserAccess,user.id)
    if access and access.tokens_after:
        cutoff=access.tokens_after.replace(tzinfo=timezone.utc).timestamp()
        issued=payload.get('iat')
        if not isinstance(issued,(int,float)) or issued<=cutoff: raise HTTPException(401,'Session revoked. Sign in again.')

def audit(db,actor,action,detail):
    db.add(AccessAudit(actor_id=actor.id,actor_name=actor.username,action=action,detail=detail))
