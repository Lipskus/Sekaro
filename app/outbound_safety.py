"""Shared outbound policy for campaigns, operator messages and test sends."""
from fastapi import HTTPException
from sqlalchemy import func, select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CampaignLead, Inbox, Lead
from app.suppression import is_suppressed


async def outbound_block_reason(db: AsyncSession, recipient: str, inbox_id: int, *, campaign_lead_id: int | None = None) -> str | None:
    from app.crm import crm_block_reason
    from app.crm_models import CrmProfile
    crm_reason = await crm_block_reason(db, recipient)
    if crm_reason == "archived":
        return crm_reason
    # Serialize final delivery with lifecycle operations; avoid stale ORM state.
    contacts = (await db.execute(
        select(Lead.archived_at).where(func.lower(Lead.email) == recipient.strip().lower(),
            ~exists(select(1).where(CrmProfile.lead_id == Lead.id, CrmProfile.merged_into.is_not(None))))
        .order_by(Lead.id).with_for_update()
    )).all()
    if any(row[0] is not None for row in contacts):
        return "archived"
    if campaign_lead_id is not None:
        enrollment = (await db.execute(select(
            CampaignLead.sending_paused, CampaignLead.archive_sending_paused,
        ).where(CampaignLead.id == campaign_lead_id))).first()
        if enrollment is None or enrollment[0] or enrollment[1]:
            return "paused_contact"
    if crm_reason == "suppressed" or await is_suppressed(db, recipient):
        return "suppressed"
    # Read the scalar from the database instead of trusting an older ORM snapshot.
    row = (await db.execute(select(Inbox.paused).where(Inbox.id == inbox_id))).first()
    if row is None:
        return "missing_inbox"
    if row[0]:
        return "paused"
    from app.mail_identity import load_identity, certificate_data, SigningError
    identity = await load_identity(db, inbox_id)
    if identity and identity.get("smime_enabled"):
        email = await db.scalar(select(Inbox.email).where(Inbox.id == inbox_id))
        try: certificate_data(identity, email)
        except SigningError: return "signing_failed"
    return None


async def require_outbound_allowed(db: AsyncSession, recipient: str, inbox_id: int) -> None:
    reason = await outbound_block_reason(db, recipient, inbox_id)
    if reason == "archived":
        raise HTTPException(409, "Kontakt jest w archiwum. Wiadomość nie została wysłana.")
    if reason == "missing_inbox":
        raise HTTPException(404, "Nie znaleziono skrzynki.")
    if reason == "suppressed":
        raise HTTPException(409, "Adres jest na liście wykluczeń. Wiadomość nie została wysłana.")
    if reason == "paused":
        raise HTTPException(409, "Skrzynka jest wstrzymana. Wiadomość nie została wysłana.")

    if reason == "signing_failed":
        raise HTTPException(409, "S/MIME signing is unavailable. Check the mailbox certificate before sending.")
