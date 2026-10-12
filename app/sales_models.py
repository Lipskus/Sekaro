"""Sales records preserve original CRM identity and never control outreach."""
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, JSON, Numeric, CheckConstraint
from app.database import Base
from app.time import utcnow

class Pipeline(Base):
    __tablename__ = 'crm_pipeline'
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    stages = Column(JSON, nullable=False)
    revision = Column(Integer, nullable=False, default=1)
    archived_at = Column(DateTime)

class Opportunity(Base):
    __tablename__ = 'crm_opportunity'
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default='')
    pipeline_id = Column(Integer, ForeignKey('crm_pipeline.id', ondelete='RESTRICT'), nullable=False, index=True)
    stage = Column(String(64), nullable=False)
    lead_id = Column(Integer, ForeignKey('lead.id', ondelete='RESTRICT'), index=True)
    company_id = Column(Integer, ForeignKey('crm_company.id', ondelete='RESTRICT'), index=True)
    value = Column(Numeric(16,2), nullable=False, default=0)
    currency = Column(String(3), nullable=False, default='PLN')
    probability = Column(Integer, nullable=False, default=0)
    expected_close = Column(Date)
    outcome = Column(String(8), nullable=False, default='open', index=True)
    outcome_reason = Column(Text, nullable=False, default='')
    closed_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow)
    archived_at = Column(DateTime)
    revision = Column(Integer, nullable=False, default=1)
    __table_args__ = (CheckConstraint('value >= 0'), CheckConstraint('probability >= 0 AND probability <= 100'))

class SalesActivity(Base):
    __tablename__ = 'crm_sales_activity'
    id = Column(Integer, primary_key=True)
    kind = Column(String(10), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default='')
    lead_id = Column(Integer, ForeignKey('lead.id', ondelete='RESTRICT'), index=True)
    company_id = Column(Integer, ForeignKey('crm_company.id', ondelete='RESTRICT'), index=True)
    opportunity_id = Column(Integer, ForeignKey('crm_opportunity.id', ondelete='RESTRICT'), index=True)
    starts_at = Column(DateTime)
    due_at = Column(DateTime, nullable=False, index=True)
    reminder_at = Column(DateTime)
    snoozed_until = Column(DateTime)
    location = Column(String(500), nullable=False, default='')
    priority = Column(String(10), nullable=False, default='normal')
    status = Column(String(12), nullable=False, default='planned', index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow)
    revision = Column(Integer, nullable=False, default=1)

class SalesEvent(Base):
    __tablename__ = 'crm_sales_event'
    id = Column(Integer, primary_key=True)
    entity = Column(String(16), nullable=False, index=True)
    entity_id = Column(Integer, nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey('app_user.id', ondelete='SET NULL'))
    actor_name = Column(String(255), nullable=False)
    at = Column(DateTime, nullable=False, default=utcnow)
    changes = Column(JSON, nullable=False)
