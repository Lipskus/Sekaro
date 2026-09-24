"""Authenticated presentation queries for Sekaro's native redesign.

Read queries do not send mail or probe DNS. Replies require an explicit,
authenticated POST. No demonstration records are created in production.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import SmtpMessage, EmailLog, Lead, Campaign
from app.unibox import list_unibox_conversations

router=APIRouter(prefix="/api/ui",tags=["ui"])

@router.get("/unibox")
async def inbox_view(
    page: int=Query(1,ge=1),
    page_size: int=Query(50,ge=1,le=200),
    inbox_id: int | None=Query(None,ge=1),
    q: str=Query("",max_length=255),
    tab: str=Query("all",pattern="^(all|unread|needs_reply|bounced)$"),
    leads_only: bool=False,
    db: AsyncSession=Depends(get_db),
):
    # Existing service materializes and sorts thread metadata before paging.
    # Reuse it without fetching message bodies; filtering must precede paging.
    base=await list_unibox_conversations(db,page=1,page_size=1_000_000,leads_only=leads_only)
    latest=(select(
        SmtpMessage.inbox_id.label("inbox_id"),
        SmtpMessage.thread_key.label("thread_id"),
        SmtpMessage.direction.label("direction"),
        func.row_number().over(
            partition_by=(SmtpMessage.inbox_id,SmtpMessage.thread_key),
            order_by=(SmtpMessage.received_at.desc(),SmtpMessage.created_at.desc(),SmtpMessage.message_id.desc()),
        ).label("rn"),
    )).subquery()
    directions={(r.inbox_id,r.thread_id):r.direction for r in
        (await db.execute(select(latest).where(latest.c.rn==1))).all()}
    associations=(select(
        EmailLog.inbox_id.label("inbox_id"), EmailLog.thread_id.label("thread_id"),
        Lead.id.label("lead_id"),Lead.email.label("lead_email"),Lead.name.label("lead_name"),
        Campaign.id.label("campaign_id"),Campaign.name.label("campaign_name"),
        func.row_number().over(
            partition_by=(EmailLog.inbox_id,EmailLog.thread_id),
            order_by=EmailLog.sent_at.desc(),
        ).label("rn"),
    ).join(Lead,Lead.id==EmailLog.lead_id).join(Campaign,Campaign.id==EmailLog.campaign_id)
      .where(EmailLog.thread_id.isnot(None))).subquery()
    associations={(r.inbox_id,r.thread_id):r for r in
        (await db.execute(select(associations).where(associations.c.rn==1))).all()}
    items=[]
    needle=q.strip().casefold()
    for raw in base["items"]:
        item=dict(raw)
        if inbox_id is not None and item["inbox_id"]!=inbox_id: continue
        key=(item["inbox_id"],item["thread_id"])
        match=associations.get(key)
        if match:
            item.update(lead_id=match.lead_id,lead_name=match.lead_name,lead_email=match.lead_email,
                        campaign_id=match.campaign_id,campaign_name=match.campaign_name)
        direction=directions.get(key)
        item["last_direction"]=direction
        item["needs_reply"]=direction=="received" and item.get("lead_status") not in {"bounced","unsubscribed","invalid"}
        hay=" ".join(str(item.get(k) or "") for k in ("subject","last_message_snippet","lead_name","lead_email"))
        if needle and needle not in hay.casefold(): continue
        items.append(item)
    def matches(item, mode):
        if mode=="unread": return bool(item.get("unread_lead_reply"))
        if mode=="needs_reply": return item["needs_reply"]
        if mode=="bounced": return item.get("lead_status") in {"bounced","invalid"}
        return True
    counts={mode:sum(matches(i,mode) for i in items) for mode in ("all","unread","needs_reply","bounced")}
    result=[i for i in items if matches(i,tab)]
    offset=(page-1)*page_size
    return {"items":result[offset:offset+page_size],"total":len(result),"page":page,"page_size":page_size,"counts":counts}

# Global contacts exist independently of campaign enrollment (like imported contacts).
# The original /api/leads POST intentionally remains unchanged for old clients.
from hashlib import blake2b
from pydantic import EmailStr, Field
from sqlalchemy import text
from app.schemas import LeadCreate, LeadResponse
from app.suppression import is_suppressed

class ContactCreate(LeadCreate):
    email: EmailStr
    name: str = Field(default="", max_length=255)

@router.post("/contacts", response_model=LeadResponse, status_code=201)
async def create_contact(data: ContactCreate, db: AsyncSession=Depends(get_db)):
    """Create a contact only. Never enroll, schedule, send or clear suppression."""
    from fastapi import HTTPException
    from app.routers.leads import _normalise_import_email

    email=_normalise_import_email(str(data.email))
    if not email:
        raise HTTPException(400,"Niepoprawny adres e-mail.")
    if len(data.custom_data)>200:
        raise HTTPException(400,"Kontakt może mieć maksymalnie 200 pól własnych.")
    if {"email","name","unsubscribe_link"}.intersection(data.custom_data):
        raise HTTPException(400,"Pola własne nie mogą zastępować zmiennych systemowych.")
    # Serialize concurrent creations of this normalized address on PostgreSQL.
    # This does not alter legacy duplicate rows or add a destructive unique index.
    if db.get_bind().dialect.name=="postgresql":
        lock_key=int.from_bytes(blake2b(email.encode(),digest_size=8).digest(),"big",signed=True)
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"),{"key":lock_key})
    duplicate=(await db.execute(select(Lead.id).where(func.lower(Lead.email)==email).limit(1))).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(409,"Kontakt o tym adresie już istnieje.")
    if await is_suppressed(db,email):
        raise HTTPException(409,"Adres znajduje się na liście wykluczeń. Nie został ponownie dodany.")
    lead=Lead(email=email,name=data.name.strip(),custom_data=data.custom_data,status="active")
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return LeadResponse(id=lead.id,email=lead.email,name=lead.name,custom_data=lead.custom_data,
                        created_at=lead.created_at,provider=lead.provider,campaigns=[])

from app.models import Inbox
from app.routers.unibox import UniboxSendRequest, send_unibox_email

class ReplyRequest(UniboxSendRequest):
    to_email: EmailStr

@router.post("/reply")
async def reply_from_inbox(data: ReplyRequest, db: AsyncSession=Depends(get_db)):
    """Explicit user reply, guarded again on the server before the SMTP service."""
    from fastapi import HTTPException
    if await is_suppressed(db,str(data.to_email)):
        raise HTTPException(409,"Adres jest na liście wykluczeń. Wiadomość nie została wysłana.")
    inbox=await db.get(Inbox,data.inbox_id)
    if inbox is None:
        raise HTTPException(404,"Nie znaleziono skrzynki.")
    if inbox.paused:
        raise HTTPException(409,"Skrzynka jest wstrzymana. Wiadomość nie została wysłana.")
    return await send_unibox_email(data,db)
