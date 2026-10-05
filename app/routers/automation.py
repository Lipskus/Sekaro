"""Private CRM rules, proposals, execution history and additive tags."""
from typing import Literal, Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from app.database import get_db
from app.auth import get_current_user
from app.time import utcnow
from app.models import Lead
from app.sales_models import Pipeline
from app.automation_models import AutomationRule, AutomationEvent, AutomationRun, AutomationAudit, ContactTag
from app.automation import audit, definition, preview, execute, process_rule, collect_overdue, rule_lock
from app.routers.sales import data
router=APIRouter(prefix='/api/crm/automations',tags=['crm automations'],dependencies=[Depends(get_current_user)])
class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid')
class TaskAction(Strict):
    type:Literal['task']
    title:str=Field(min_length=1,max_length=255)
    delay_days:int=Field(default=1,ge=0,le=365)
    @field_validator('title')
    @classmethod
    def title_required(cls,v):
        if not v.strip():raise ValueError('Title is required')
        return v.strip()
class TagAction(Strict):
    type:Literal['tag']
    tag:str=Field(pattern=r'^[\w -]{1,64}$')
    @field_validator('tag')
    @classmethod
    def tag_required(cls,v):
        if not v.strip():raise ValueError('Tag is required')
        return v.strip()
class MoveAction(Strict):
    type:Literal['move_stage']
    stage:str=Field(pattern=r'^[a-z0-9_-]{1,64}$')
class Conditions(Strict):
    campaign_id:int|None=Field(default=None,gt=0)
    pipeline_id:int|None=Field(default=None,gt=0)
    stage:str|None=Field(default=None,max_length=64)
    outcome:Literal['open','won','lost']|None=None
class RuleBody(Strict):
    name:str=Field(min_length=1,max_length=120)
    mode:Literal['approval','automatic']='approval'
    trigger:Literal['reply','enrollment_completed','opportunity_changed','activity_overdue','meeting_created']
    conditions:Conditions=Field(default_factory=Conditions)
    action:Annotated[TaskAction|TagAction|MoveAction,Field(discriminator='type')]
    daily_limit:int=Field(default=100,ge=1,le=1000)
    revision:int|None=Field(default=None,ge=1)
    @field_validator('name')
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError('Name is required')
        return v.strip()
    @model_validator(mode='after')
    def meaningful(self):
        if self.action.type=='move_stage' and (self.trigger!='opportunity_changed' or not self.conditions.pipeline_id):raise ValueError('Stage changes require an opportunity trigger and a pipeline filter')
        if self.conditions.pipeline_id and self.trigger!='opportunity_changed':raise ValueError('Pipeline filter requires opportunity trigger')
        if (self.conditions.stage or self.conditions.outcome) and self.trigger!='opportunity_changed':raise ValueError('Stage and outcome filters require opportunity trigger')
        if self.conditions.campaign_id and self.trigger not in ('reply','enrollment_completed'):raise ValueError('Campaign filter requires outreach trigger')
        return self
class Toggle(Strict):
    revision:int=Field(ge=1)
    enabled:bool
class Decision(Strict):
    revision:int=Field(ge=1)
    action:Literal['approve','reject','retry']

async def validate_action(db,body):
    if body.conditions.pipeline_id:
        p=await db.get(Pipeline,body.conditions.pipeline_id)
        if not p or p.archived_at:raise HTTPException(422,'Select an active pipeline')
        stages={x['key'] for x in p.stages}
        if body.conditions.stage and body.conditions.stage not in stages:raise HTTPException(422,'Unknown source stage')
        if body.action.type=='move_stage' and body.action.stage not in stages:raise HTTPException(422,'Unknown target stage')

@router.get('/rules')
async def rules(db=Depends(get_db)):
    return [data(r) for r in (await db.scalars(select(AutomationRule).order_by(AutomationRule.id.desc()))).all()]

@router.post('/rules',status_code=201)
async def create(body:RuleBody,db=Depends(get_db),actor=Depends(get_current_user)):
    await validate_action(db,body)
    row=AutomationRule(**body.model_dump(exclude={'revision','conditions'}),conditions=body.conditions.model_dump(exclude_none=True),enabled=False)
    db.add(row);await db.flush();audit(db,row,actor,'created',definition(row));await db.commit();return data(row)

@router.put('/rules/{id}')
async def update(id:int,body:RuleBody,db=Depends(get_db),actor=Depends(get_current_user)):
    row=await rule_lock(db,id)
    if row.revision!=body.revision:raise HTTPException(409,'Rule changed. Reload before saving.')
    if row.enabled:raise HTTPException(409,'Pause the rule before editing')
    await validate_action(db,body)
    before=definition(row)
    for k,v in body.model_dump(exclude={'revision','conditions'}).items():setattr(row,k,v)
    row.conditions=body.conditions.model_dump(exclude_none=True);row.revision+=1
    audit(db,row,actor,'updated',{'before':before,'after':definition(row)})
    await db.commit();return data(row)

@router.post('/rules/{id}/enabled')
async def toggle(id:int,body:Toggle,db=Depends(get_db),actor=Depends(get_current_user)):
    row=await rule_lock(db,id)
    if row.revision!=body.revision:raise HTTPException(409,'Rule changed. Reload before saving.')
    if row.enabled!=body.enabled:
        row.enabled=body.enabled
        # Resuming starts at now; existing proposals remain auditable and require
        # the unchanged definition, while events from the pause are not replayed.
        if row.enabled:row.activated_at=utcnow()
        audit(db,row,actor,'enabled' if row.enabled else 'paused',definition(row))
    await db.commit();return data(row)

@router.get('/rules/{id}/preview')
async def rule_preview(id:int,db=Depends(get_db)):
    rule=await db.get(AutomationRule,id)
    if not rule:raise HTTPException(404,'Rule not found')
    events=(await db.scalars(select(AutomationEvent).where(AutomationEvent.trigger==rule.trigger).order_by(AutomationEvent.id.desc()).limit(20))).all()
    return {'historical_sample':True,'definition':definition(rule),'items':[{'event_id':e.id,'payload':e.payload,'plan':await preview(db,rule,e.payload)} for e in events]}

async def scan(db,actor):
    # One stable row serializes all collectors in manual/periodic workers.
    first=await db.scalar(select(AutomationRule).order_by(AutomationRule.id).limit(1).with_for_update())
    if not first:return {'created':0,'executed':0}
    await collect_overdue(db)
    ids=(await db.scalars(select(AutomationRule.id).where(AutomationRule.enabled.is_(True)).order_by(AutomationRule.id))).all()
    totals={'created':0,'executed':0}
    for id in ids:
        r=await process_rule(db,id,actor)
        for key in totals:totals[key]+=r[key]
    await db.commit();return totals

@router.post('/scan')
async def scan_now(db=Depends(get_db),actor=Depends(get_current_user)):
    return await scan(db,actor)

@router.get('/runs')
async def runs(rule_id:int|None=None,state:Literal['pending','succeeded','skipped','failed','rejected']|None=None,limit:int=Query(100,ge=1,le=500),db=Depends(get_db)):
    q=select(AutomationRun)
    if rule_id:q=q.where(AutomationRun.rule_id==rule_id)
    if state:q=q.where(AutomationRun.state==state)
    return [data(r) for r in (await db.scalars(q.order_by(AutomationRun.id.desc()).limit(limit))).all()]

@router.post('/runs/{id}/decision')
async def decide(id:int,body:Decision,db=Depends(get_db),actor=Depends(get_current_user)):
    run=await db.get(AutomationRun,id)
    if not run:raise HTTPException(404,'Run not found')
    rule=await rule_lock(db,run.rule_id)
    run=await db.scalar(select(AutomationRun).where(AutomationRun.id==id).with_for_update().execution_options(populate_existing=True))
    if rule.revision!=body.revision:raise HTTPException(409,'Rule changed. Reload before deciding.')
    if body.action=='reject':
        if run.state not in ('pending','failed'):raise HTTPException(409,'Run has already finished')
        run.state='rejected';run.finished_at=utcnow();audit(db,rule,actor,'rejected',{},run)
    else:
        required='failed' if body.action=='retry' else 'pending'
        if run.state!=required:raise HTTPException(409,'Run has already been processed')
        await execute(db,rule,run,actor)
    await db.commit();return data(run)

@router.get('/rules/{id}/audit')
async def history(id:int,db=Depends(get_db)):
    return [data(r) for r in (await db.scalars(select(AutomationAudit).where(AutomationAudit.rule_id==id).order_by(AutomationAudit.id.desc()).limit(200))).all()]

@router.get('/contacts/{id}/tags')
async def tags(id:int,db=Depends(get_db)):
    if not await db.get(Lead,id):raise HTTPException(404,'Contact not found')
    from app.routers.sales import contact_ids
    ids=await contact_ids(db,id)
    return sorted(set((await db.scalars(select(ContactTag.tag).where(ContactTag.lead_id.in_(ids)))).all()))
