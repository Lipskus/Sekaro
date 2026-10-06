"""Private CRM API. No transport, public routes, or separate person identity."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select, func, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import get_current_user
from app.database import get_db
from app.models import Lead
from app.crm_models import ContactAddress, Company, CompanyContact, CrmNote, CompanyOperation
from app.crm import writable, profile_for, contact_view, merge_preview, merge_contacts
from app.contact_lifecycle import record_operation
from app.time import utcnow

router = APIRouter(prefix='/api/crm',tags=['crm'],dependencies=[Depends(get_current_user)])

class KindBody(BaseModel):
    kind: Literal['unspecified','person','shared_mailbox']
class AddressBody(BaseModel):
    email: EmailStr
    label: str = Field(default='',max_length=100)
class NoteBody(BaseModel):
    body: str = Field(min_length=1,max_length=10000)
class CompanyBody(BaseModel):
    name: str = Field(min_length=1,max_length=255)
    domain: str = Field(default='',max_length=255)
    description: str = Field(default='',max_length=10000)
class ArchiveBody(BaseModel):
    archived: bool
class RelationBody(BaseModel):
    company_id: int = Field(gt=0)
    role: str = Field(default='',max_length=255)
class MergeBody(BaseModel):
    source_id: int = Field(gt=0)
    fingerprint: str = Field(min_length=64,max_length=64)
    choices: dict[str,Literal['source','target']] = Field(default_factory=dict)

def company_dict(c):
    return dict(id=c.id,name=c.name,domain=c.domain,description=c.description,archived_at=c.archived_at,created_at=c.created_at)

def company_event(db,c,action,actor,summary):
    db.add(CompanyOperation(company_id=c.id,action=action,actor_id=actor.id,actor_name=actor.username,summary=summary))

@router.get('/companies')
async def companies(q: str = Query('',max_length=255), archived: bool=False, db: AsyncSession=Depends(get_db)):
    stmt = select(Company).where(Company.archived_at.is_not(None) if archived else Company.archived_at.is_(None))
    if q.strip(): stmt=stmt.where(Company.name.ilike('%'+q.strip()+'%'))
    return [company_dict(c) for c in (await db.execute(stmt.order_by(Company.name,Company.id).limit(500))).scalars()]

@router.post('/companies',status_code=201)
async def create_company(body: CompanyBody, db: AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    if not body.name.strip(): raise HTTPException(422,'Company name is required')
    c=Company(name=body.name.strip(),domain=body.domain.strip(),description=body.description.strip())
    db.add(c); await db.flush()
    company_event(db,c,'create',actor,c.name)
    await db.commit()
    return company_dict(c)

@router.get('/companies/{company_id}')
async def company_detail(company_id:int,db:AsyncSession=Depends(get_db)):
    c=await db.get(Company,company_id)
    if not c: raise HTTPException(404,'Company not found')
    contacts=[dict(id=l.id,name=l.name,email=l.email,role=r.role,archived_at=l.archived_at) for r,l in (await db.execute(select(CompanyContact,Lead).join(Lead,Lead.id==CompanyContact.lead_id).where(CompanyContact.company_id==company_id).order_by(Lead.id))).all()]
    history=[dict(action=x.action,summary=x.summary,actor_name=x.actor_name,at=x.created_at) for x in (await db.execute(select(CompanyOperation).where(CompanyOperation.company_id==company_id).order_by(CompanyOperation.id.desc()).limit(200))).scalars()]
    return {**company_dict(c),'contacts':contacts,'history':history}

@router.patch('/companies/{company_id}')
async def update_company(company_id:int,body:CompanyBody,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    c=(await db.execute(select(Company).where(Company.id==company_id).with_for_update())).scalar_one_or_none()
    if not c: raise HTTPException(404,'Company not found')
    if not body.name.strip(): raise HTTPException(422,'Company name is required')
    import json
    old=company_dict(c)
    c.name,c.domain,c.description=body.name.strip(),body.domain.strip(),body.description.strip()
    company_event(db,c,'update',actor,json.dumps({'before':old,'after':company_dict(c)},ensure_ascii=False,default=str))
    await db.commit()
    return company_dict(c)

@router.post('/companies/{company_id}/archive')
async def archive_company(company_id:int,body:ArchiveBody,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    c=(await db.execute(select(Company).where(Company.id==company_id).with_for_update())).scalar_one_or_none()
    if not c: raise HTTPException(404,'Company not found')
    c.archived_at=utcnow() if body.archived else None
    company_event(db,c,'archive' if body.archived else 'restore',actor,c.name)
    await db.commit()
    return company_dict(c)

@router.get('/contacts/{lead_id}')
async def contact(lead_id:int,db:AsyncSession=Depends(get_db)):
    return await contact_view(db,lead_id)

@router.patch('/contacts/{lead_id}/kind')
async def contact_kind(lead_id:int,body:KindBody,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    lead=await writable(db,lead_id)
    profile=await profile_for(db,lead)
    if body.kind != 'person' and (await contact_view(db,lead_id))['members']:
        raise HTTPException(409,'Merged people cannot become a shared mailbox')
    before=profile.kind; profile.kind=body.kind
    record_operation(db,lead_id,'crm_kind',actor,{'before':before,'after':body.kind})
    await db.commit()
    return await contact_view(db,lead_id)

@router.post('/contacts/{lead_id}/addresses',status_code=201)
async def add_address(lead_id:int,body:AddressBody,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    await writable(db,lead_id)
    email=str(body.email).strip().lower()
    view=await contact_view(db,lead_id)
    if any(a['email'].lower()==email for a in view['addresses']): raise HTTPException(409,'Address already belongs to this contact')
    db.add(ContactAddress(lead_id=lead_id,email=email,label=body.label.strip()))
    record_operation(db,lead_id,'crm_address',actor,{'email':email,'label':body.label.strip()})
    await db.commit()
    return await contact_view(db,lead_id)

@router.delete('/contacts/{lead_id}/addresses/{address_id}')
async def remove_address(lead_id:int,address_id:int,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    await writable(db,lead_id)
    a=await db.get(ContactAddress,address_id)
    if not a or a.lead_id!=lead_id: raise HTTPException(404,'Address not found on this contact')
    record_operation(db,lead_id,'crm_address_removed',actor,{'email':a.email,'label':a.label})
    await db.delete(a); await db.commit()
    return {'ok':True}

@router.post('/contacts/{lead_id}/notes',status_code=201)
async def add_note(lead_id:int,body:NoteBody,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    await writable(db,lead_id)
    if not body.body.strip(): raise HTTPException(422,'Note is empty')
    note=CrmNote(lead_id=lead_id,body=body.body.strip(),actor_id=actor.id,actor_name=actor.username)
    db.add(note); await db.flush()
    record_operation(db,lead_id,'crm_note',actor,{'note_id':note.id})
    await db.commit()
    return await contact_view(db,lead_id)

@router.post('/contacts/{lead_id}/companies')
async def link_company(lead_id:int,body:RelationBody,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    await writable(db,lead_id)
    c=(await db.execute(select(Company).where(Company.id==body.company_id).with_for_update())).scalar_one_or_none()
    if not c: raise HTTPException(404,'Company not found')
    if c.archived_at: raise HTTPException(409,'Company is archived')
    relation=(await db.execute(select(CompanyContact).where(CompanyContact.lead_id==lead_id,CompanyContact.company_id==c.id))).scalar_one_or_none()
    if relation: relation.role=body.role.strip()
    else: db.add(CompanyContact(lead_id=lead_id,company_id=c.id,role=body.role.strip()))
    record_operation(db,lead_id,'crm_company',actor,{'company_id':c.id,'name':c.name,'role':body.role.strip()})
    company_event(db,c,'contact_link',actor,f'#{lead_id}: {body.role.strip()}')
    await db.commit()
    return await contact_view(db,lead_id)

@router.delete('/contacts/{lead_id}/companies/{company_id}')
async def unlink_company(lead_id:int,company_id:int,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    await writable(db,lead_id)
    c=(await db.execute(select(Company).where(Company.id==company_id).with_for_update())).scalar_one_or_none()
    if not c: raise HTTPException(404,'Company not found')
    await db.execute(delete(CompanyContact).where(CompanyContact.lead_id==lead_id,CompanyContact.company_id==company_id))
    record_operation(db,lead_id,'crm_company_removed',actor,{'company_id':company_id,'name':c.name})
    company_event(db,c,'contact_unlink',actor,f'#{lead_id}')
    await db.commit()
    return {'ok':True}

@router.get('/contacts/{lead_id}/merge-preview')
async def preview(lead_id:int,source_id:int,db:AsyncSession=Depends(get_db)):
    return await merge_preview(db,lead_id,source_id)

@router.post('/contacts/{lead_id}/merge')
async def merge(lead_id:int,body:MergeBody,db:AsyncSession=Depends(get_db),actor=Depends(get_current_user)):
    result=await merge_contacts(db,lead_id,body.source_id,body.fingerprint,body.choices,actor)
    await db.commit()
    return result
