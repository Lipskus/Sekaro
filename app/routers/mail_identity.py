"""Administrator mailbox identity settings. Credentials never leave this API."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from app.auth import require_admin
from app.database import get_db
from app.models import Inbox
from app.mail_identity import MailIdentity, certificate_data, SigningError
from app.access import audit
from app.security import encryption_enabled

router = APIRouter(prefix='/api/inboxes',tags=['mail-identity'],dependencies=[Depends(require_admin)])

class IdentityBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int
    footer_enabled: bool = False
    footer_html: str = Field(default='',max_length=20000)
    footer_text: str = Field(default='',max_length=10000)
    smime_enabled: bool = False
    certificate: str | None = Field(default=None,max_length=350000)
    password: str | None = Field(default=None,max_length=1024)
    remove_certificate: bool = False

async def mailbox(db,id):
    inbox = await db.scalar(select(Inbox).where(Inbox.id==id).with_for_update())
    if not inbox: raise HTTPException(404,'Mailbox not found')
    return inbox

def public(row,email):
    data = {'revision':row.revision if row else 0,'footer_enabled':bool(row and row.footer_enabled),
        'footer_html':row.footer_html if row else '', 'footer_text':row.footer_text if row else '',
        'smime_enabled':bool(row and row.smime_enabled),'has_certificate':bool(row and row.certificate),
        'encryption_ready':encryption_enabled(),'certificate_status':None,'certificate_expires':None}
    if row and row.certificate:
        try:
            _,cert,_=certificate_data({'certificate':row.certificate,'password':row.password},email)
            data['certificate_status']='valid';data['certificate_expires']=cert.not_valid_after_utc.isoformat()
        except SigningError as e:data['certificate_status']=str(e)
    return data

@router.get('/{inbox_id}/identity')
async def read(inbox_id:int,db=Depends(get_db)):
    inbox=await db.get(Inbox,inbox_id)
    if not inbox:raise HTTPException(404,'Mailbox not found')
    return public(await db.get(MailIdentity,inbox_id),inbox.email)

@router.put('/{inbox_id}/identity')
async def save(inbox_id:int,body:IdentityBody,db=Depends(get_db),user=Depends(require_admin)):
    inbox=await mailbox(db,inbox_id)
    row=await db.get(MailIdentity,inbox_id,populate_existing=True)
    if body.revision != (row.revision if row else 0):raise HTTPException(409,'Settings changed. Reload before saving.')
    if body.remove_certificate and body.smime_enabled:raise HTTPException(422,'Disable S/MIME before removing the certificate')
    certificate = '' if body.remove_certificate else (body.certificate if body.certificate is not None else (row.certificate if row else ''))
    password = '' if body.remove_certificate else (body.password if body.password is not None else (row.password if row else ''))
    if body.certificate is not None or body.smime_enabled:
        try:certificate_data({'certificate':certificate,'password':password},inbox.email)
        except SigningError as e:raise HTTPException(422,str(e)) from None
    # Same server-side allowlist as other email HTML; no scripts/event handlers.
    from app.mail_identity import sanitize_email_html
    clean_html=sanitize_email_html(body.footer_html)
    if body.footer_enabled and not body.footer_text.strip():raise HTTPException(422,'Provide a plain-text footer for text messages')
    if row is None:
        row=MailIdentity(inbox_id=inbox_id,revision=0);db.add(row)
    row.footer_enabled=body.footer_enabled;row.footer_html=clean_html;row.footer_text=body.footer_text
    row.smime_enabled=body.smime_enabled;row.certificate=certificate;row.password=password;row.revision+=1
    audit(db,user,'mail.identity.update',{'inbox_id':inbox_id,'footer_enabled':row.footer_enabled,'smime_enabled':row.smime_enabled,'certificate_replaced':body.certificate is not None,'certificate_removed':body.remove_certificate})
    await db.commit()
    return public(row,inbox.email)


from app.auth import get_current_user
preview_router = APIRouter(prefix='/api/inboxes', dependencies=[Depends(get_current_user)])
class PreviewBody(BaseModel):
    body: str = Field(default='', max_length=200000)
    is_html: bool = False

@preview_router.post('/{inbox_id}/identity-preview')
async def preview(inbox_id:int, body:PreviewBody, db=Depends(get_db)):
    inbox=await db.get(Inbox,inbox_id)
    if not inbox:raise HTTPException(404,'Mailbox not found')
    from app.mail_identity import load_identity, append_footer
    identity=await load_identity(db,inbox_id)
    return {'body':append_footer(body.body,body.is_html,identity),'is_html':body.is_html,
            'smime_enabled':bool(identity and identity.get('smime_enabled'))}
