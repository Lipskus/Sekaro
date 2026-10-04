"""Lifecycle mutations preserve contact identity and correspondence."""
from fastapi import HTTPException
from sqlalchemy import delete, exists, select

from app.models import CampaignLead, ContactOperation, Lead, QueueSlot, SendAttempt
from app.time import utcnow


def record_operation(db, lead_id, action, actor, details=None):
    db.add(ContactOperation(
        lead_id=lead_id, action=action, actor_id=actor.id,
        actor_name=actor.username, details=details or {},
    ))


async def set_archived(db, lead_ids, archived, actor):
    ids = sorted(set(lead_ids))
    leads = list((await db.execute(
        select(Lead).where(Lead.id.in_(ids)).order_by(Lead.id)
        .with_for_update().execution_options(populate_existing=True)
    )).scalars())
    if len(leads) != len(ids):
        raise HTTPException(404, "Contact not found")
    if not archived:
        from app.crm import writable
        for lead in leads:
            await writable(db, lead.id)
    changed = 0
    for lead in leads:
        if (lead.archived_at is not None) == archived:
            continue
        lead.archived_at = utcnow() if archived else None
        if archived:
            enrollments = list((await db.execute(
                select(CampaignLead).where(CampaignLead.lead_id == lead.id)
            )).scalars())
            for enrollment in enrollments:
                enrollment.sending_paused = True
                enrollment.archive_sending_paused = True
            # Keep uncertain/in-progress durable claims for operator review.
            await db.execute(delete(QueueSlot).where(
                QueueSlot.campaign_lead_id.in_([e.id for e in enrollments]),
                ~exists(select(1).where(SendAttempt.queue_slot_id == QueueSlot.id)),
            ))
        record_operation(db, lead.id, "archive" if archived else "restore", actor)
        changed += 1
    await db.flush()
    return changed
