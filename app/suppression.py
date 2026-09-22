"""Global do-not-contact helpers for Sekaro."""
from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CampaignLead, Lead, QueueSlot, SuppressionEntry


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


async def get_suppression(
    db: AsyncSession,
    email: str,
) -> SuppressionEntry | None:
    norm = normalize_email(email)
    if not norm:
        return None
    result = await db.execute(
        select(SuppressionEntry).where(SuppressionEntry.email == norm)
    )
    return result.scalar_one_or_none()


async def is_suppressed(db: AsyncSession, email: str) -> bool:
    norm = normalize_email(email)
    if not norm:
        return False
    result = await db.execute(
        select(SuppressionEntry.id).where(SuppressionEntry.email == norm).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def suppress_email(
    db: AsyncSession,
    email: str,
    *,
    reason: str = "manual",
    source: str = "manual",
    note: str = "",
    stop_active_sends: bool = True,
) -> SuppressionEntry:
    """Create/update a global suppression entry and stop queued sends."""
    norm = normalize_email(email)
    if not norm or "@" not in norm:
        raise ValueError("A valid email address is required")

    existing = await get_suppression(db, norm)
    if existing is None:
        existing = SuppressionEntry(
            email=norm,
            reason=(reason or "manual").strip()[:64],
            source=(source or "manual").strip()[:64],
            note=(note or "").strip(),
        )
        db.add(existing)
        await db.flush()
    else:
        if reason:
            existing.reason = reason.strip()[:64]
        if source:
            existing.source = source.strip()[:64]
        if note:
            existing.note = note.strip()

    if stop_active_sends:
        lead_ids_res = await db.execute(
            select(Lead.id).where(func.lower(Lead.email) == norm)
        )
        lead_ids = [row[0] for row in lead_ids_res.all()]
        if lead_ids:
            enrollments_res = await db.execute(
                select(CampaignLead).where(CampaignLead.lead_id.in_(lead_ids))
            )
            enrollments = enrollments_res.scalars().all()
            enrollment_ids = [cl.id for cl in enrollments]

            for cl in enrollments:
                cl.sending_paused = True
                if (reason or "").strip().lower() in {
                    "unsubscribe",
                    "unsubscribed",
                    "opt_out",
                    "opt-out",
                }:
                    cl.enrollment_status = "unsubscribed"
                    cl.interest_status = None

            if enrollment_ids:
                await db.execute(
                    delete(QueueSlot).where(
                        QueueSlot.campaign_lead_id.in_(enrollment_ids)
                    )
                )

    await db.flush()
    return existing


async def remove_suppression(db: AsyncSession, entry_id: int) -> bool:
    result = await db.execute(
        select(SuppressionEntry).where(SuppressionEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return False
    await db.delete(entry)
    await db.flush()
    return True
