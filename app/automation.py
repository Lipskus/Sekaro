"""Bounded, auditable CRM actions. No sending, enrollment, unsuppression or external calls."""
from datetime import timedelta
from types import SimpleNamespace
from fastapi import HTTPException
from sqlalchemy import select, func, exists
from app.time import utcnow
from app.models import Lead, CampaignLead
from app.crm_models import CrmProfile, Company
from app.sales_models import Pipeline, Opportunity, SalesActivity, SalesEvent
from app.automation_models import AutomationRule, AutomationEvent, AutomationRun, AutomationAudit, ContactTag
SYSTEM=SimpleNamespace(id=None,username='CRM automation')

def audit(db,rule,actor,action,detail=None,run=None):
    db.add(AutomationAudit(rule_id=rule.id,run_id=run.id if run else None,actor_id=actor.id,actor_name=actor.username,action=action,detail=detail or {}))

def definition(rule):
    return {k:getattr(rule,k) for k in ('name','mode','trigger','conditions','action','daily_limit','revision')}

async def rule_lock(db,id):
    row=await db.scalar(select(AutomationRule).where(AutomationRule.id==id).with_for_update().execution_options(populate_existing=True))
    if not row:raise HTTPException(404,'Rule not found')
    return row

async def preview(db,rule,payload):
    for key,value in rule.conditions.items():
        if payload.get(key)!=value:return {'eligible':False,'reason':'conditions'}
    result={'eligible':True,'action':rule.action,'lead_id':payload.get('lead_id'),'opportunity_id':payload.get('opportunity_id'),'company_id':payload.get('company_id')}
    if result['opportunity_id']:
        deal=await db.get(Opportunity,result['opportunity_id'])
        if not deal or deal.archived_at:return {'eligible':False,'reason':'opportunity_archived'}
        if payload.get('revision') and rule.action['type']=='move_stage' and deal.revision!=payload['revision']:return {'eligible':False,'reason':'opportunity_changed'}
        result['lead_id']=result['lead_id'] or deal.lead_id
        result['company_id']=result['company_id'] or deal.company_id
    if result['lead_id']:
        lead=await db.get(Lead,result['lead_id']);profile=await db.get(CrmProfile,result['lead_id'])
        if not lead or lead.archived_at or (profile and profile.merged_into):return {'eligible':False,'reason':'contact_archived_or_merged'}
    if result['company_id']:
        company=await db.get(Company,result['company_id'])
        if not company or company.archived_at:return {'eligible':False,'reason':'company_archived'}
    kind=rule.action['type']
    if kind=='tag' and not result['lead_id']:return {'eligible':False,'reason':'contact_required'}
    if kind=='move_stage':
        if not result['opportunity_id']:return {'eligible':False,'reason':'opportunity_required'}
        pipeline=await db.get(Pipeline,deal.pipeline_id)
        if not pipeline or pipeline.archived_at or rule.action['stage'] not in {x['key'] for x in pipeline.stages}:return {'eligible':False,'reason':'stage_unavailable'}
    if rule.trigger=='activity_overdue':
        activity=await db.get(SalesActivity,payload.get('activity_id'))
        if not activity or activity.status!='planned' or activity.due_at>=utcnow() or activity.due_at.isoformat()!=payload.get('due_at'):return {'eligible':False,'reason':'no_longer_overdue'}
    if rule.trigger=='enrollment_completed':
        enrollment=await db.get(CampaignLead,payload.get('enrollment_id'))
        if not enrollment or enrollment.enrollment_status!='completed':return {'eligible':False,'reason':'enrollment_changed'}
    return result

async def execute(db,rule,run,actor):
    if run.state not in ('pending','failed'):return run
    if not rule.enabled:raise HTTPException(409,'Rule is paused')
    if run.revision!=rule.revision:raise HTTPException(409,'Rule changed; reject this stale proposal')
    today=utcnow().replace(hour=0,minute=0,second=0,microsecond=0)
    count=await db.scalar(select(func.count()).select_from(AutomationRun).where(AutomationRun.rule_id==rule.id,AutomationRun.state=='succeeded',AutomationRun.finished_at>=today))
    if count>=rule.daily_limit:raise HTTPException(409,'Daily action limit reached')
    run.attempts+=1
    audit(db,rule,actor,'attempt',{'attempt':run.attempts},run)
    try:
        # Savepoint keeps a failed action atomic while preserving its failure record.
        async with db.begin_nested():
            payload=run.payload
            if payload.get('opportunity_id'):
                deal=await db.get(Opportunity,payload['opportunity_id'])
                if deal:
                    await db.scalar(select(Pipeline).where(Pipeline.id==deal.pipeline_id).with_for_update())
                    await db.scalar(select(Opportunity).where(Opportunity.id==deal.id).with_for_update().execution_options(populate_existing=True))
            lid=payload.get('lead_id') or (deal.lead_id if payload.get('opportunity_id') and deal else None)
            if lid:await db.scalar(select(Lead).where(Lead.id==lid).with_for_update().execution_options(populate_existing=True))
            if rule.trigger=='activity_overdue' and payload.get('activity_id'):
                await db.scalar(select(SalesActivity).where(SalesActivity.id==payload['activity_id']).with_for_update().execution_options(populate_existing=True))
            company_id=payload.get('company_id') or (deal.company_id if payload.get('opportunity_id') and deal else None)
            if company_id:await db.scalar(select(Company).where(Company.id==company_id).with_for_update().execution_options(populate_existing=True))
            plan=await preview(db,rule,payload)
            if not plan['eligible']:
                run.state='skipped';run.result=plan
            else:
                action=rule.action
                if action['type']=='task':
                    task=SalesActivity(kind='task',title=action['title'],description=f'CRM automation #{rule.id}; event #{run.event_id}',lead_id=plan['lead_id'],company_id=plan['company_id'],opportunity_id=plan['opportunity_id'],due_at=utcnow()+timedelta(days=action['delay_days']))
                    db.add(task);await db.flush()
                    from app.routers.sales import data
                    db.add(SalesEvent(entity='activity',entity_id=task.id,actor_name=SYSTEM.username,changes={'before':None,'after':data(task),'automation_run_id':run.id}))
                    run.result={'activity_id':task.id}
                elif action['type']=='tag':
                    tag=await db.scalar(select(ContactTag).where(ContactTag.lead_id==plan['lead_id'],ContactTag.tag==action['tag']))
                    if not tag:db.add(ContactTag(lead_id=plan['lead_id'],tag=action['tag']))
                    run.result={'lead_id':plan['lead_id'],'tag':action['tag'],'already_present':bool(tag)}
                else:
                    from app.routers.sales import data
                    before=data(deal);deal.stage=action['stage'];deal.revision+=1;deal.updated_at=utcnow();await db.flush()
                    db.add(SalesEvent(entity='opportunity',entity_id=deal.id,actor_name=SYSTEM.username,changes={'before':before,'after':data(deal),'automation_run_id':run.id}))
                    run.result={'opportunity_id':deal.id,'stage':deal.stage}
                run.state='succeeded'
            run.finished_at=utcnow();await db.flush()
    except Exception:
        import logging
        logging.getLogger(__name__).exception('CRM automation run %s failed',run.id)
        run.state='failed';run.result={'reason':'action_failed'};run.finished_at=utcnow()
    audit(db,rule,actor,run.state,run.result,run)
    return run

async def collect_overdue(db):
    # Generated tasks never feed the engine again. A changed due date is a new occurrence.
    rules=list((await db.scalars(select(AutomationRule).where(AutomationRule.enabled.is_(True),AutomationRule.trigger=='activity_overdue'))).all())
    if not rules:return
    start=min(r.activated_at for r in rules if r.activated_at)
    rows=(await db.scalars(select(SalesActivity).where(SalesActivity.status=='planned',SalesActivity.due_at>=start,SalesActivity.due_at<utcnow(),~exists(select(SalesEvent.id).where(SalesEvent.entity=='activity',SalesEvent.entity_id==SalesActivity.id,SalesEvent.actor_name==SYSTEM.username,SalesEvent.actor_id.is_(None))),~exists(select(AutomationEvent.id).where(AutomationEvent.trigger=='activity_overdue',AutomationEvent.payload['activity_id'].as_integer()==SalesActivity.id,AutomationEvent.occurred_at==SalesActivity.due_at))).order_by(SalesActivity.due_at,SalesActivity.id).limit(100))).all()
    for row in rows:
        key=f'overdue:{row.id}:{row.due_at.isoformat()}'
        if not await db.scalar(select(AutomationEvent.id).where(AutomationEvent.source_key==key)):
            db.add(AutomationEvent(source_key=key,trigger='activity_overdue',occurred_at=row.due_at,payload={'activity_id':row.id,'due_at':row.due_at.isoformat(),'lead_id':row.lead_id,'company_id':row.company_id,'opportunity_id':row.opportunity_id}))
    await db.flush()

async def process_rule(db,id,actor=SYSTEM):
    rule=await rule_lock(db,id)
    if not rule.enabled:return {'created':0,'executed':0}
    # Use the durable run ledger rather than only an ID cursor: PG transactions can
    # commit out of sequence. An earlier ID committed later must not be lost.
    events=(await db.scalars(select(AutomationEvent).where(AutomationEvent.trigger==rule.trigger,AutomationEvent.occurred_at>=rule.activated_at,~exists(select(AutomationRun.id).where(AutomationRun.rule_id==rule.id,AutomationRun.event_id==AutomationEvent.id))).order_by(AutomationEvent.id).limit(100))).all()
    for ev in events:
        plan=await preview(db,rule,ev.payload)
        run=AutomationRun(rule_id=rule.id,event_id=ev.id,revision=rule.revision,definition=definition(rule),payload=ev.payload,state='pending' if plan['eligible'] else 'skipped',result=plan,finished_at=None if plan['eligible'] else utcnow())
        db.add(run);await db.flush();audit(db,rule,actor,'proposal',plan,run)
        rule.checkpoint=max(rule.checkpoint,ev.id)
    executed=0
    if rule.mode=='automatic':
        runs=(await db.scalars(select(AutomationRun).where(AutomationRun.rule_id==id,AutomationRun.state=='pending',AutomationRun.revision==rule.revision).order_by(AutomationRun.id).limit(100))).all()
        for run in runs:
            try:await execute(db,rule,run,actor);executed+=1
            except HTTPException:break
    return {'created':len(events),'executed':executed}

async def run_crm_automation_job():
    import logging,os
    if os.environ.get('SEKARO_DEMO_MODE')=='1':return
    from app.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            # Serialize overdue collection under one stable rule lock, shared with manual scan.
            from app.routers.automation import scan
            await scan(db,SYSTEM)
    except Exception:logging.getLogger(__name__).exception('CRM automation scan failed')
