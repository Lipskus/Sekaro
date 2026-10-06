"""Additive CRM automation tables. Never grant access to outbound transport."""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean, UniqueConstraint, event, inspect
from sqlalchemy.orm import Session
from app.database import Base
from app.time import utcnow

class AutomationRule(Base):
    __tablename__='crm_automation_rule'
    id=Column(Integer,primary_key=True)
    name=Column(String(120),nullable=False)
    enabled=Column(Boolean,nullable=False,default=False)
    mode=Column(String(16),nullable=False,default='approval')
    trigger=Column(String(32),nullable=False)
    conditions=Column(JSON,nullable=False,default=dict)
    action=Column(JSON,nullable=False)
    revision=Column(Integer,nullable=False,default=1)
    daily_limit=Column(Integer,nullable=False,default=100)
    activated_at=Column(DateTime)
    checkpoint=Column(Integer,nullable=False,default=0)
    created_at=Column(DateTime,nullable=False,default=utcnow)

class AutomationEvent(Base):
    __tablename__='crm_automation_event'
    id=Column(Integer,primary_key=True)
    source_key=Column(String(200),nullable=False,unique=True)
    trigger=Column(String(32),nullable=False,index=True)
    occurred_at=Column(DateTime,nullable=False,default=utcnow,index=True)
    payload=Column(JSON,nullable=False)

class AutomationRun(Base):
    __tablename__='crm_automation_run'
    id=Column(Integer,primary_key=True)
    rule_id=Column(Integer,ForeignKey('crm_automation_rule.id',ondelete='RESTRICT'),nullable=False,index=True)
    event_id=Column(Integer,ForeignKey('crm_automation_event.id',ondelete='RESTRICT'),nullable=False)
    revision=Column(Integer,nullable=False)
    definition=Column(JSON,nullable=False)
    payload=Column(JSON,nullable=False)
    state=Column(String(16),nullable=False,default='pending',index=True)
    attempts=Column(Integer,nullable=False,default=0)
    result=Column(JSON,nullable=False,default=dict)
    created_at=Column(DateTime,nullable=False,default=utcnow)
    finished_at=Column(DateTime)
    __table_args__=(UniqueConstraint('rule_id','event_id'),)

class AutomationAudit(Base):
    __tablename__='crm_automation_audit'
    id=Column(Integer,primary_key=True)
    rule_id=Column(Integer,ForeignKey('crm_automation_rule.id',ondelete='RESTRICT'),nullable=False,index=True)
    run_id=Column(Integer,ForeignKey('crm_automation_run.id',ondelete='RESTRICT'))
    actor_id=Column(Integer,ForeignKey('app_user.id',ondelete='SET NULL'))
    actor_name=Column(String(255),nullable=False)
    action=Column(String(32),nullable=False)
    detail=Column(JSON,nullable=False,default=dict)
    at=Column(DateTime,nullable=False,default=utcnow)

class ContactTag(Base):
    __tablename__='crm_contact_tag'
    id=Column(Integer,primary_key=True)
    lead_id=Column(Integer,ForeignKey('lead.id',ondelete='RESTRICT'),nullable=False,index=True)
    tag=Column(String(64),nullable=False)
    __table_args__=(UniqueConstraint('lead_id','tag'),)

@event.listens_for(Session,'after_flush')
def capture_crm_events(session,context):
    # Written in the source transaction: no event can outlive a rolled-back edit.
    from app.models import LeadReply, CampaignLead
    from app.sales_models import SalesEvent
    for row in list(session.new):
        if isinstance(row,LeadReply):
            session.add(AutomationEvent(source_key=f'reply:{row.id}',trigger='reply',payload={'lead_id':row.lead_id,'campaign_id':row.campaign_id}))
        elif isinstance(row,SalesEvent) and row.actor_name!='CRM automation':
            before=row.changes.get('before') or {};after=row.changes.get('after') or {}
            payload={k:after.get(k) for k in ('lead_id','company_id','pipeline_id','stage','outcome','revision')}
            if row.entity=='opportunity' and before and any(before.get(k)!=after.get(k) for k in ('stage','outcome')):
                payload['opportunity_id']=row.entity_id
                session.add(AutomationEvent(source_key=f'sales:{row.id}',trigger='opportunity_changed',payload=payload))
            elif row.entity=='activity' and not before and after.get('kind')=='meeting':
                payload.update(activity_id=row.entity_id,opportunity_id=after.get('opportunity_id'))
                session.add(AutomationEvent(source_key=f'sales:{row.id}',trigger='meeting_created',payload=payload))
    for row in list(session.dirty):
        if isinstance(row,CampaignLead) and row.enrollment_status=='completed' and inspect(row).attrs.enrollment_status.history.has_changes():
            session.add(AutomationEvent(source_key=f'completed:{row.id}:{utcnow().isoformat()}',trigger='enrollment_completed',payload={'lead_id':row.lead_id,'campaign_id':row.campaign_id,'enrollment_id':row.id}))
