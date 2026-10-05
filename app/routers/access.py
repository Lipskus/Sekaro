"""Administrator-only identity administration; no hard deletion of authors."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy import select, func, text
from app.database import get_db
from app.auth import require_admin, hash_password
from app.models import User, APIKey
from app.access import AccessRole, AccessTeam, AccessMember, UserAccess, AccessAudit, PERMISSIONS, permissions_for, audit
from app.routers.auth import RegisterRequest
from app.time import utcnow

router=APIRouter(prefix='/api/access',tags=['access'],dependencies=[Depends(require_admin)])

class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid')
class RoleBody(Strict):
    name:str=Field(min_length=1,max_length=120)
    permissions:list[str]=Field(default_factory=list,max_length=12)
    revision:int|None=None
    @field_validator('permissions')
    @classmethod
    def valid(cls,v):
        if set(v)-set(PERMISSIONS):raise ValueError('Unknown permission')
        if any(p.endswith('.write') and p.replace('.write','.read') not in v for p in v):raise ValueError('Write requires read')
        return sorted(set(v))
class TeamBody(Strict):
    name:str=Field(min_length=1,max_length=120)
    role_id:int|None=None
    members:list[int]=Field(default_factory=list,max_length=1000)
    revision:int|None=None
class UserBody(Strict):
    role_id:int|None=None
    administrator:bool=False
    active:bool=True
    revision:int
class NewUser(RegisterRequest):
    model_config=ConfigDict(extra='forbid')
    role_id:int|None=None
    administrator:bool=False
class Revision(Strict):
    revision:int

async def lock(db):
    # Serialize mutations across workers, including last-admin and membership checks.
    if db.bind.dialect.name=='postgresql':await db.execute(text('SELECT pg_advisory_xact_lock(736208)'))
async def role_exists(db,id):
    if id is not None and not await db.get(AccessRole,id):raise HTTPException(422,'Role not found')
async def unique(db,model,name,id=None):
    name=name.strip()
    if not name:raise HTTPException(422,'Name required')
    stmt=select(model.id).where(func.lower(model.name)==name.lower())
    if id:stmt=stmt.where(model.id!=id)
    if await db.scalar(stmt):raise HTTPException(409,'Name already exists')
    return name
async def version(db,model,id,revision):
    row=await db.get(model,id,populate_existing=True)
    if not row:raise HTTPException(404,'Record not found')
    if revision!=row.revision:raise HTTPException(409,'Record changed. Reload before saving.')
    return row
async def user_info(db,u):
    a=await db.get(UserAccess,u.id)
    return dict(id=u.id,username=u.username,email=u.email,administrator=u.role=='admin',active=u.is_active,role_id=a.role_id if a else None,legacy_access=a is None and u.role!='admin',revision=a.revision if a else 0,permissions=sorted(await permissions_for(db,u)))

@router.get('')
async def overview(db=Depends(get_db)):
    users=(await db.execute(select(User).order_by(User.id))).scalars().all()
    roles=[dict(id=r.id,name=r.name,permissions=r.permissions,revision=r.revision) for r in (await db.execute(select(AccessRole).order_by(AccessRole.id))).scalars()]
    teams=[]
    for r in (await db.execute(select(AccessTeam).order_by(AccessTeam.id))).scalars():
        members=list((await db.execute(select(AccessMember.user_id).where(AccessMember.team_id==r.id))).scalars())
        teams.append(dict(id=r.id,name=r.name,role_id=r.role_id,members=members,revision=r.revision))
    return dict(users=[await user_info(db,u) for u in users],roles=roles,teams=teams,permissions=PERMISSIONS)

@router.post('/roles',status_code=201)
@router.put('/roles/{id}')
async def save_role(body:RoleBody,id:int|None=None,db=Depends(get_db),actor=Depends(require_admin)):
    await lock(db)
    row=await version(db,AccessRole,id,body.revision) if id else AccessRole(revision=0)
    before=dict(name=row.name,permissions=row.permissions) if id else None
    row.name=await unique(db,AccessRole,body.name,id);row.permissions=body.permissions;row.revision+=1
    db.add(row);await db.flush();audit(db,actor,'role.updated' if id else 'role.created',dict(id=row.id,before=before,after=dict(name=row.name,permissions=row.permissions)))
    return {'id':row.id,'revision':row.revision}

@router.post('/teams',status_code=201)
@router.put('/teams/{id}')
async def save_team(body:TeamBody,id:int|None=None,db=Depends(get_db),actor=Depends(require_admin)):
    await lock(db);await role_exists(db,body.role_id)
    ids=set(body.members)
    if ids and set((await db.execute(select(User.id).where(User.id.in_(ids)))).scalars())!=ids:raise HTTPException(422,'User not found')
    row=await version(db,AccessTeam,id,body.revision) if id else AccessTeam(revision=0)
    old=list((await db.execute(select(AccessMember).where(AccessMember.team_id==id))).scalars()) if id else []
    before=dict(name=row.name,role_id=row.role_id,members=[m.user_id for m in old]) if id else None
    row.name=await unique(db,AccessTeam,body.name,id);row.role_id=body.role_id;row.revision+=1
    db.add(row);await db.flush()
    for member in old:
        if member.user_id not in ids:await db.delete(member)
    for uid in ids-{m.user_id for m in old}:db.add(AccessMember(team_id=row.id,user_id=uid))
    audit(db,actor,'team.updated' if id else 'team.created',dict(id=row.id,before=before,after=dict(name=row.name,role_id=row.role_id,members=sorted(ids))))
    return {'id':row.id,'revision':row.revision}

@router.post('/users',status_code=201)
async def create_user(body:NewUser,db=Depends(get_db),actor=Depends(require_admin)):
    await lock(db);await role_exists(db,body.role_id)
    if len(body.password.encode())>72:raise HTTPException(422,'Password must be at most 72 UTF-8 bytes')
    if await db.scalar(select(User.id).where((User.username==body.username)|(User.email==body.email))):raise HTTPException(409,'Username or email already exists')
    user=User(username=body.username,email=body.email,password_hash=hash_password(body.password),role='admin' if body.administrator else 'user',is_active=True)
    db.add(user);await db.flush();db.add(UserAccess(user_id=user.id,role_id=body.role_id,revision=1));await db.flush()
    audit(db,actor,'user.created',dict(id=user.id,username=user.username,administrator=body.administrator,role_id=body.role_id))
    return await user_info(db,user)

@router.put('/users/{id}')
async def update_user(id:int,body:UserBody,db=Depends(get_db),actor=Depends(require_admin)):
    await lock(db);await role_exists(db,body.role_id)
    user=await db.get(User,id,populate_existing=True)
    if not user:raise HTTPException(404,'User not found')
    a=await db.get(UserAccess,id,populate_existing=True)
    if body.revision!=(a.revision if a else 0):raise HTTPException(409,'Record changed. Reload before saving.')
    if id==actor.id and (not body.active or not body.administrator):raise HTTPException(409,'Cannot disable or demote your own account')
    if user.role=='admin' and user.is_active and (not body.active or not body.administrator):
        count=await db.scalar(select(func.count(User.id)).where(User.role=='admin',User.is_active==True))
        if count<=1:raise HTTPException(409,'At least one active administrator is required')
    before=await user_info(db,user)
    if a is None:a=UserAccess(user_id=id,revision=0);db.add(a)
    a.role_id=body.role_id;a.revision+=1
    user.role='admin' if body.administrator else 'user';user.is_active=body.active
    if not body.active:
        a.tokens_after=utcnow()
        for key in (await db.execute(select(APIKey).where(APIKey.user_id==id))).scalars():key.revoked=True
    await db.flush();after=await user_info(db,user)
    audit(db,actor,'user.updated',dict(id=id,before=before,after=after))
    return after

@router.post('/users/{id}/revoke-sessions')
async def revoke(id:int,body:Revision,db=Depends(get_db),actor=Depends(require_admin)):
    await lock(db)
    if not await db.get(User,id):raise HTTPException(404,'User not found')
    a=await db.get(UserAccess,id,populate_existing=True)
    if body.revision!=(a.revision if a else 0):raise HTTPException(409,'Record changed. Reload before saving.')
    # Revocation must not change an unmigrated user's existing business permissions.
    if a is None:
        role=AccessRole(name='Legacy '+str(id)+' '+utcnow().isoformat(),permissions=list(PERMISSIONS));db.add(role);await db.flush()
        a=UserAccess(user_id=id,role_id=role.id,revision=0);db.add(a)
    a.tokens_after=utcnow();a.revision+=1
    for key in (await db.execute(select(APIKey).where(APIKey.user_id==id))).scalars():key.revoked=True
    audit(db,actor,'user.sessions_revoked',{'id':id})
    return {'revision':a.revision}

@router.get('/audit')
async def history(before:int|None=None,db=Depends(get_db)):
    stmt=select(AccessAudit).order_by(AccessAudit.id.desc()).limit(100)
    if before is not None:stmt=stmt.where(AccessAudit.id<before)
    return [dict(id=r.id,actor_name=r.actor_name,action=r.action,detail=r.detail,at=r.at) for r in (await db.execute(stmt)).scalars()]
