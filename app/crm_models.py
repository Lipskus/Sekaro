"""CRM extensions reference the existing Lead; correspondence keeps its original IDs."""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from app.database import Base
from app.time import utcnow

class CrmProfile(Base):
    __tablename__ = 'crm_profile'
    lead_id = Column(Integer, ForeignKey('lead.id', ondelete='CASCADE'), primary_key=True)
    kind = Column(String(20), nullable=False, default='unspecified')
    merged_into = Column(Integer, ForeignKey('lead.id', ondelete='RESTRICT'), nullable=True, index=True)

class ContactAddress(Base):
    __tablename__ = 'contact_address'
    id = Column(Integer, primary_key=True)
    lead_id = Column(Integer, ForeignKey('lead.id', ondelete='CASCADE'), nullable=False, index=True)
    email = Column(String(255), nullable=False)
    label = Column(String(100), nullable=False, default='')
    created_at = Column(DateTime, default=utcnow, nullable=False)
    __table_args__ = (UniqueConstraint('lead_id', 'email'),)

class Company(Base):
    __tablename__ = 'crm_company'
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    domain = Column(String(255), nullable=False, default='')
    description = Column(Text, nullable=False, default='')
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

class CompanyContact(Base):
    __tablename__ = 'crm_company_contact'
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey('crm_company.id', ondelete='CASCADE'), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey('lead.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(String(255), nullable=False, default='')
    __table_args__ = (UniqueConstraint('company_id', 'lead_id'),)

class CrmNote(Base):
    __tablename__ = 'crm_note'
    id = Column(Integer, primary_key=True)
    lead_id = Column(Integer, ForeignKey('lead.id', ondelete='CASCADE'), nullable=False, index=True)
    body = Column(Text, nullable=False)
    actor_id = Column(Integer, ForeignKey('app_user.id', ondelete='SET NULL'), nullable=True)
    actor_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

class CompanyOperation(Base):
    __tablename__ = 'crm_company_operation'
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey('crm_company.id', ondelete='CASCADE'), nullable=False, index=True)
    action = Column(String(32), nullable=False)
    actor_id = Column(Integer, ForeignKey('app_user.id', ondelete='SET NULL'), nullable=True)
    actor_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    summary = Column(Text, nullable=False)
