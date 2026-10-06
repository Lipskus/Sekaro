"""Private, revision-checked sales CRUD. No transport or scheduler side effects."""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from sqlalchemy import select, or_, and_, func
from app.database import get_db
from app.auth import get_current_user
from app.models import Lead
from app.crm_models import Company, CrmProfile
from app.sales_models import Pipeline, Opportunity, SalesActivity, SalesEvent
from app.time import utcnow

router = APIRouter(prefix='/api/crm/sales', tags=['sales'], dependencies=[Depends(get_current_user)])

class Body(BaseModel):
    model_config = ConfigDict(extra='forbid')
    @field_validator('title','name',check_fields=False)
    @classmethod
    def nonblank(cls,v):
        v=v.strip()
        if not v: raise ValueError('A name is required')
        return v

class Stage(Body):
    key: str = Field(pattern=r'^[a-z0-9_-]{1,64}$')
    name: str = Field(min_length=1,max_length=120)

class PipelineBody(Body):
    name: str = Field(min_length=1,max_length=120)
    stages: list[Stage] = Field(min_length=1,max_length=20)
    revision: int | None = Field(default=None,ge=1)
    archived: bool = False
    @model_validator(mode='after')
    def unique(self):
        if len({s.key for s in self.stages}) != len(self.stages): raise ValueError('Stage keys must be unique')
        return self

class DealBody(Body):
    title: str = Field(min_length=1,max_length=255)
    description: str = Field(default='',max_length=10000)
    pipeline_id: int = Field(gt=0)
    stage: str = Field(min_length=1,max_length=64)
    lead_id: int | None = Field(default=None,gt=0)
    company_id: int | None = Field(default=None,gt=0)
    value: Decimal = Field(default=0,ge=0,max_digits=16,decimal_places=2)
    currency: str = Field(default='PLN',pattern=r'^[A-Z]{3}$')
    probability: int = Field(default=0,ge=0,le=100)
    expected_close: date | None = None
    outcome: Literal['open','won','lost'] = 'open'
    outcome_reason: str = Field(default='',max_length=2000)
    revision: int | None = Field(default=None,ge=1)
    archived: bool = False
    @model_validator(mode='after')
    def reason(self):
        if self.outcome=='lost' and not self.outcome_reason.strip(): raise ValueError('A loss reason is required')
        return self

class ActivityBody(Body):
    title: str = Field(min_length=1,max_length=255)
    description: str = Field(default='',max_length=10000)
    kind: Literal['task','meeting']
    lead_id: int | None = Field(default=None,gt=0)
    company_id: int | None = Field(default=None,gt=0)
    opportunity_id: int | None = Field(default=None,gt=0)
    starts_at: datetime | None = None
    due_at: datetime
    reminder_at: datetime | None = None
    snoozed_until: datetime | None = None
    location: str = Field(default='',max_length=500)
    priority: Literal['low','normal','high'] = 'normal'
    status: Literal['planned','done','cancelled'] = 'planned'
    revision: int | None = Field(default=None,ge=1)
    @field_validator('starts_at','due_at','reminder_at','snoozed_until')
    @classmethod
    def utc(cls,v):
        if v is None: return v
        if v.tzinfo is None or v.utcoffset() is None: raise ValueError('Include timezone offset')
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    @model_validator(mode='after')
    def dates(self):
        if self.kind=='meeting' and (not self.starts_at or self.due_at<=self.starts_at): raise ValueError('Meeting end must follow start')
        if self.kind=='task' and self.starts_at is not None: raise ValueError('Tasks use a due date only')
        if self.reminder_at and self.reminder_at>(self.starts_at or self.due_at): raise ValueError('Reminder must precede the activity')
        return self

def data(row):
    result={c.name:getattr(row,c.name) for c in row.__table__.columns}
    for k,v in result.items():
        if isinstance(v,datetime): result[k]=v.isoformat()+'Z'
        elif isinstance(v,date): result[k]=v.isoformat()
        elif isinstance(v,Decimal): result[k]=str(v)
    return result

def event(db,row,entity,actor,before):
    db.add(SalesEvent(entity=entity,entity_id=row.id,actor_id=actor.id,actor_name=actor.username,changes={'before':before,'after':data(row)}))

async def locked(db,model,id,revision):
    row=(await db.execute(select(model).where(model.id==id).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if row is None: raise HTTPException(404,'Record not found')
    if revision!=row.revision: raise HTTPException(409,'Record changed. Reload before saving.')
    return row

async def links(db,body,old=None):
    # Lock linked contacts before writes, as merge/delete do. Retain original IDs on existing records.
    if body.lead_id:
        lead=(await db.execute(select(Lead).where(Lead.id==body.lead_id).with_for_update())).scalar_one_or_none()
        if not lead: raise HTTPException(404,'Contact not found')
        if old is None or old.lead_id!=body.lead_id:
            profile=await db.get(CrmProfile,body.lead_id)
            if lead.archived_at or (profile and profile.merged_into): raise HTTPException(409,'Select an active canonical contact')
    if body.company_id:
        c=await db.get(Company,body.company_id)
        if not c: raise HTTPException(404,'Company not found')
        if c.archived_at and (old is None or old.company_id!=c.id): raise HTTPException(409,'Company is archived')

async def contact_ids(db,id):
    p=await db.get(CrmProfile,id)
    root=p.merged_into if p and p.merged_into else id
    return [root]+list((await db.execute(select(CrmProfile.lead_id).where(CrmProfile.merged_into==root))).scalars())

@router.get('/pipelines')
async def pipelines(db=Depends(get_db)):
    return [data(x) for x in (await db.execute(select(Pipeline).order_by(Pipeline.id))).scalars()]

async def save_pipeline(db,body,actor,id=None):
    row=await locked(db,Pipeline,id,body.revision) if id else Pipeline()
    before=data(row) if id else None
    if id:
        used=set((await db.execute(select(Opportunity.stage).where(Opportunity.pipeline_id==id))).scalars())
        if used-{s.key for s in body.stages}: raise HTTPException(409,'A stage with opportunity history cannot be removed')
    row.name=body.name;row.stages=[s.model_dump() for s in body.stages]
    row.archived_at=(row.archived_at or utcnow()) if body.archived else None
    row.revision=(row.revision+1) if id else 1
    db.add(row);await db.flush();event(db,row,'pipeline',actor,before);await db.commit()
    return data(row)

@router.post('/pipelines',status_code=201)
async def pipeline_create(body:PipelineBody,db=Depends(get_db),actor=Depends(get_current_user)):
    return await save_pipeline(db,body,actor)

@router.put('/pipelines/{id}')
async def pipeline_update(id:int,body:PipelineBody,db=Depends(get_db),actor=Depends(get_current_user)):
    return await save_pipeline(db,body,actor,id)

@router.get('/opportunities')
async def deals(q:str=Query('',max_length=255),pipeline_id:int|None=None,outcome:Literal['open','won','lost']|None=None,lead_id:int|None=None,company_id:int|None=None,archived:bool=False,offset:int=Query(0,ge=0),limit:int=Query(100,ge=1,le=500),db=Depends(get_db)):
    stmt=select(Opportunity).where(Opportunity.archived_at.is_not(None) if archived else Opportunity.archived_at.is_(None))
    if q.strip(): stmt=stmt.where(Opportunity.title.ilike('%'+q.strip()+'%'))
    if pipeline_id: stmt=stmt.where(Opportunity.pipeline_id==pipeline_id)
    if outcome: stmt=stmt.where(Opportunity.outcome==outcome)
    if lead_id: stmt=stmt.where(Opportunity.lead_id.in_(await contact_ids(db,lead_id)))
    if company_id: stmt=stmt.where(Opportunity.company_id==company_id)
    total=await db.scalar(select(func.count()).select_from(stmt.subquery()))
    return {'total':total,'items':[data(x) for x in (await db.execute(stmt.order_by(Opportunity.updated_at.desc(),Opportunity.id.desc()).offset(offset).limit(limit))).scalars()]}

async def save_deal(db,body,actor,id=None):
    # Pipeline lock serializes stage configuration with opportunity writes.
    pipeline=(await db.execute(select(Pipeline).where(Pipeline.id==body.pipeline_id).with_for_update())).scalar_one_or_none()
    if not pipeline: raise HTTPException(404,'Pipeline not found')
    row=await locked(db,Opportunity,id,body.revision) if id else Opportunity()
    before=data(row) if id else None
    if body.stage not in {s['key'] for s in pipeline.stages}: raise HTTPException(422,'Unknown pipeline stage')
    if pipeline.archived_at and (not id or row.pipeline_id!=pipeline.id): raise HTTPException(409,'Pipeline is archived')
    await links(db,body,row if id else None)
    old_outcome=row.outcome
    for k,v in body.model_dump(exclude={'revision','archived'}).items(): setattr(row,k,v)
    if old_outcome!=body.outcome: row.closed_at=None if body.outcome=='open' else utcnow()
    row.archived_at=(row.archived_at or utcnow()) if body.archived else None
    row.revision=(row.revision+1) if id else 1;row.updated_at=utcnow()
    db.add(row);await db.flush();event(db,row,'opportunity',actor,before);await db.commit()
    return data(row)

@router.post('/opportunities',status_code=201)
async def deal_create(body:DealBody,db=Depends(get_db),actor=Depends(get_current_user)):
    return await save_deal(db,body,actor)

@router.put('/opportunities/{id}')
async def deal_update(id:int,body:DealBody,db=Depends(get_db),actor=Depends(get_current_user)):
    return await save_deal(db,body,actor,id)

@router.get('/activities')
async def activities(status:Literal['planned','done','cancelled']|None=None,kind:Literal['task','meeting']|None=None,opportunity_id:int|None=None,lead_id:int|None=None,company_id:int|None=None,date_from:datetime|None=None,date_to:datetime|None=None,offset:int=Query(0,ge=0),limit:int=Query(100,ge=1,le=500),db=Depends(get_db)):
    stmt=select(SalesActivity)
    for bound in (date_from,date_to):
        if bound and (bound.tzinfo is None or bound.utcoffset() is None): raise HTTPException(422,'Include timezone offset')
    if date_from and date_to and date_to<=date_from: raise HTTPException(422,'End must follow start')
    if date_from:
        start=date_from.astimezone(timezone.utc).replace(tzinfo=None)
        stmt=stmt.where(or_(SalesActivity.due_at>start,and_(SalesActivity.starts_at.is_(None),SalesActivity.due_at==start)))
    if date_to: stmt=stmt.where(func.coalesce(SalesActivity.starts_at,SalesActivity.due_at)<date_to.astimezone(timezone.utc).replace(tzinfo=None))
    if status: stmt=stmt.where(SalesActivity.status==status)
    if kind: stmt=stmt.where(SalesActivity.kind==kind)
    if opportunity_id: stmt=stmt.where(SalesActivity.opportunity_id==opportunity_id)
    if lead_id:
        ids=await contact_ids(db,lead_id)
        stmt=stmt.where(or_(SalesActivity.lead_id.in_(ids),SalesActivity.opportunity_id.in_(select(Opportunity.id).where(Opportunity.lead_id.in_(ids)))))
    if company_id: stmt=stmt.where(or_(SalesActivity.company_id==company_id,SalesActivity.opportunity_id.in_(select(Opportunity.id).where(Opportunity.company_id==company_id))))
    total=await db.scalar(select(func.count()).select_from(stmt.subquery()))
    now=utcnow();items=[]
    for row in (await db.execute(stmt.order_by(SalesActivity.due_at,SalesActivity.id).offset(offset).limit(limit))).scalars():
        item=data(row)
        item['overdue']=row.status=='planned' and row.due_at<now
        item['reminder_due']=row.status=='planned' and bool(row.reminder_at and row.reminder_at<=now) and not (row.snoozed_until and row.snoozed_until>now)
        items.append(item)
    return {'total':total,'items':items}

async def save_activity(db,body,actor,id=None):
    row=await locked(db,SalesActivity,id,body.revision) if id else SalesActivity()
    before=data(row) if id else None
    await links(db,body,row if id else None)
    if body.opportunity_id:
        deal=await db.get(Opportunity,body.opportunity_id)
        if not deal: raise HTTPException(404,'Opportunity not found')
        if deal.archived_at and (not id or row.opportunity_id!=deal.id): raise HTTPException(409,'Opportunity is archived')
    for k,v in body.model_dump(exclude={'revision'}).items(): setattr(row,k,v)
    row.revision=(row.revision+1) if id else 1;row.updated_at=utcnow()
    db.add(row);await db.flush();event(db,row,'activity',actor,before);await db.commit()
    return data(row)

@router.post('/activities',status_code=201)
async def activity_create(body:ActivityBody,db=Depends(get_db),actor=Depends(get_current_user)):
    return await save_activity(db,body,actor)

@router.put('/activities/{id}')
async def activity_update(id:int,body:ActivityBody,db=Depends(get_db),actor=Depends(get_current_user)):
    return await save_activity(db,body,actor,id)

@router.get('/history/{entity}/{id}')
async def history(entity:Literal['pipeline','opportunity','activity'],id:int,db=Depends(get_db)):
    return [data(x) for x in (await db.execute(select(SalesEvent).where(SalesEvent.entity==entity,SalesEvent.entity_id==id).order_by(SalesEvent.id.desc()).limit(200))).scalars()]
