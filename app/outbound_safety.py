"""Shared outbound policy for campaigns, operator messages and test sends."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Inbox
from app.suppression import is_suppressed


async def outbound_block_reason(db: AsyncSession, recipient: str, inbox_id: int) -> str | None:
    if await is_suppressed(db, recipient):
        return "suppressed"
    # Read the scalar from the database instead of trusting an older ORM snapshot.
    row = (await db.execute(select(Inbox.paused).where(Inbox.id == inbox_id))).first()
    if row is None:
        return "missing_inbox"
    if row[0]:
        return "paused"
    return None


async def require_outbound_allowed(db: AsyncSession, recipient: str, inbox_id: int) -> None:
    reason = await outbound_block_reason(db, recipient, inbox_id)
    if reason == "missing_inbox":
        raise HTTPException(404, "Nie znaleziono skrzynki.")
    if reason == "suppressed":
        raise HTTPException(409, "Adres jest na liście wykluczeń. Wiadomość nie została wysłana.")
    if reason == "paused":
        raise HTTPException(409, "Skrzynka jest wstrzymana. Wiadomość nie została wysłana.")
