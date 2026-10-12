"""Generic SMTP / IMAP inbox provider routes (per-inbox credentials)."""
from __future__ import annotations

import asyncio
import logging

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Inbox, SmtpAccount, SmtpArchive, SmtpSyncState
from app.mail_archive import source_key
from app.smtp_utils import (
    sanitize_connection_error,
    test_account_connections,
    validate_smtp_account_payload,
)
from app.time import utcnow

log = logging.getLogger("quickly.smtp_router")

router = APIRouter(prefix="/api/smtp", tags=["smtp"])


class SmtpAccountUpsert(BaseModel):
    smtp_host: str = Field(..., max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = Field(..., max_length=255)
    # Empty string on update means "keep the stored secret" (create requires one).
    smtp_password: str = Field(default="", max_length=1024)
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    imap_host: str = Field(default="", max_length=255)
    imap_port: int = Field(default=993, ge=1, le=65535)
    imap_username: str = Field(default="", max_length=255)
    imap_password: str = Field(default="", max_length=1024)
    imap_use_ssl: bool = True


class SmtpAccountResponse(BaseModel):
    id: int
    inbox_id: int
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_use_tls: bool
    smtp_use_ssl: bool
    imap_host: str
    imap_port: int
    imap_username: str
    imap_use_ssl: bool
    has_smtp_password: bool = False
    has_imap_password: bool = False
    last_tested_at: str | None = None
    last_test_ok: bool = False
    last_test_error: str = ""

    class Config:
        from_attributes = True


def _to_response(acct: SmtpAccount) -> dict:
    return {
        "id": acct.id,
        "inbox_id": acct.inbox_id,
        "smtp_host": acct.smtp_host,
        "smtp_port": acct.smtp_port,
        "smtp_username": acct.smtp_username,
        "smtp_use_tls": bool(acct.smtp_use_tls),
        "smtp_use_ssl": bool(acct.smtp_use_ssl),
        "imap_host": acct.imap_host or "",
        "imap_port": acct.imap_port or 993,
        "imap_username": acct.imap_username or "",
        "imap_use_ssl": bool(acct.imap_use_ssl),
        "has_smtp_password": bool(acct.smtp_password),
        "has_imap_password": bool(acct.imap_password),
        "last_tested_at": acct.last_tested_at.isoformat() if acct.last_tested_at else None,
        "last_test_ok": bool(acct.last_test_ok),
        "last_test_error": acct.last_test_error or "",
    }


async def _get_smtp_inbox(db: AsyncSession, inbox_id: int) -> Inbox:
    result = await db.execute(select(Inbox).where(Inbox.id == inbox_id))
    inbox = result.scalar_one_or_none()
    if not inbox:
        raise HTTPException(404, "Inbox not found")
    if (inbox.provider or "") != "smtp":
        raise HTTPException(400, "Inbox is not an SMTP inbox (provider must be 'smtp')")
    return inbox


@router.get("/accounts")
async def list_smtp_accounts(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all SMTP accounts with their parent inbox info."""
    result = await db.execute(
        select(SmtpAccount, Inbox)
        .join(Inbox, SmtpAccount.inbox_id == Inbox.id)
        .order_by(SmtpAccount.created_at.desc())
    )
    rows = result.all()
    return [
        {
            **_to_response(acct),
            "inbox_email": inbox.email,
            "inbox_display_name": inbox.display_name,
            "max_emails_per_day": inbox.max_emails_per_day,
        }
        for acct, inbox in rows
    ]


@router.get("/inboxes/{inbox_id}", response_model=SmtpAccountResponse)
async def get_smtp_account(
    inbox_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_smtp_inbox(db, inbox_id)
    result = await db.execute(select(SmtpAccount).where(SmtpAccount.inbox_id == inbox_id))
    acct = result.scalar_one_or_none()
    if not acct:
        raise HTTPException(404, "SMTP account not configured for this inbox")
    return _to_response(acct)


@router.put("/inboxes/{inbox_id}", response_model=SmtpAccountResponse)
async def upsert_smtp_account(
    inbox_id: int,
    data: SmtpAccountUpsert,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Create or replace the SMTP/IMAP credentials for an SMTP inbox.

    Does NOT test the connection (use ``POST .../test`` for that) so that
    bulk edits stay fast; the UI calls test explicitly.
    """
    await _get_smtp_inbox(db, inbox_id)
    payload = data.model_dump()

    result = await db.execute(select(SmtpAccount).where(SmtpAccount.inbox_id == inbox_id).with_for_update())
    acct = result.scalar_one_or_none()
    is_create = acct is None
    # For validation on update, fall back to stored secrets when the caller
    # left password fields empty (meaning "keep").
    effective = dict(payload)
    if not is_create:
        if not effective.get("smtp_password"):
            effective["smtp_password"] = acct.smtp_password or ""
        if not effective.get("imap_password"):
            effective["imap_password"] = acct.imap_password or ""
    err = validate_smtp_account_payload(effective, require_password=is_create)
    if err:
        raise HTTPException(400, err)
    if is_create:
        if not (payload.get("smtp_password") or ""):
            raise HTTPException(400, "smtp_password is required")
        acct = SmtpAccount(inbox_id=inbox_id)
        db.add(acct)
    connection_fields = ("smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_use_tls", "smtp_use_ssl",
                         "imap_host", "imap_port", "imap_username", "imap_password", "imap_use_ssl")
    previous_connection = tuple(getattr(acct, key) for key in connection_fields)
    previous_source = source_key(acct) if not is_create else None
    acct.smtp_host = payload["smtp_host"].strip()
    acct.smtp_port = int(payload["smtp_port"])
    acct.smtp_username = payload["smtp_username"].strip()
    # Empty password on update keeps the stored secret.
    if payload.get("smtp_password"):
        acct.smtp_password = payload["smtp_password"]
    elif is_create:
        acct.smtp_password = ""
    acct.smtp_use_tls = bool(payload["smtp_use_tls"])
    acct.smtp_use_ssl = bool(payload["smtp_use_ssl"])
    acct.imap_host = (payload.get("imap_host") or "").strip()
    acct.imap_port = int(payload.get("imap_port") or 993)
    acct.imap_username = (payload.get("imap_username") or "").strip()
    # Only overwrite the IMAP password when the caller sent one (empty string
    # from the UI means "keep the stored secret").
    if payload.get("imap_password"):
        acct.imap_password = payload["imap_password"]
    elif not acct.imap_host:
        acct.imap_password = ""
    acct.imap_use_ssl = bool(payload.get("imap_use_ssl", True))
    if previous_connection != tuple(getattr(acct, key) for key in connection_fields):
        acct.last_tested_at = None
        acct.last_test_ok = False
        acct.last_test_error = ""
    if previous_source is not None and previous_source != source_key(acct):
        state = (await db.execute(select(SmtpSyncState).where(SmtpSyncState.inbox_id == inbox_id))).scalar_one_or_none()
        if state:
            state.uidvalidity = None
            state.archive_last_uid = 0
            state.last_uid = 0
        acct.retention_mode = "keep"  # A different mailbox requires a fresh explicit choice.
    acct.updated_at = utcnow()
    await db.flush()
    log.info("SMTP account saved: inbox_id=%s host=%s", inbox_id, acct.smtp_host)
    return _to_response(acct)


@router.post("/inboxes/{inbox_id}/test")
async def test_smtp_account(
    inbox_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Test the stored SMTP (+ IMAP when configured) connection and persist the result."""
    await _get_smtp_inbox(db, inbox_id)
    result = await db.execute(select(SmtpAccount).where(SmtpAccount.inbox_id == inbox_id))
    acct = result.scalar_one_or_none()
    if not acct:
        raise HTTPException(404, "SMTP account not configured for this inbox")

    smtp_res, imap_res = await asyncio.to_thread(test_account_connections, acct)
    ok = bool(smtp_res.ok and imap_res.ok)
    err_parts = [p for p in (smtp_res.error, imap_res.error) if p]
    acct.last_tested_at = utcnow()
    acct.last_test_ok = ok
    # Persist a sanitised category message — raw exception text can leak
    # internal hostnames/ports and act as a network-probing oracle. Full
    # detail goes to the application log only.
    last_err = sanitize_connection_error("; ".join(err_parts))
    acct.last_test_error = last_err[:2000]
    acct.updated_at = utcnow()
    await db.flush()
    log.info("SMTP test: inbox_id=%s ok=%s errors=%r", inbox_id, ok, err_parts)
    return {
        "ok": ok,
        "smtp": {
            "ok": smtp_res.ok,
            "error": smtp_res.error if smtp_res.ok else sanitize_connection_error(smtp_res.error),
            "detail": smtp_res.detail,
        },
        "imap": {
            "ok": imap_res.ok,
            "error": imap_res.error if imap_res.ok else sanitize_connection_error(imap_res.error),
            "detail": imap_res.detail,
        },
        "last_tested_at": acct.last_tested_at.isoformat(),
    }


@router.delete("/inboxes/{inbox_id}")
async def disconnect_smtp(
    inbox_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Remove SMTP credentials (inbox row itself is kept for history)."""
    await _get_smtp_inbox(db, inbox_id)
    result = await db.execute(select(SmtpAccount).where(SmtpAccount.inbox_id == inbox_id))
    acct = result.scalar_one_or_none()
    if not acct:
        raise HTTPException(404, "SMTP account not found")
    inbox = await db.get(Inbox, inbox_id)
    email = inbox.email if inbox else ""
    await db.delete(acct)
    await db.flush()
    log.info("SMTP disconnected: inbox_id=%s", inbox_id)
    return {"ok": True, "inbox_id": inbox_id, "email": email}



class RetentionSettings(BaseModel):
    mode: Literal["keep", "immediate", "days"] = "keep"
    days: int = Field(default=30, ge=1, le=3650)
    confirm_delete: bool = False


@router.put("/inboxes/{inbox_id}/retention")
async def update_retention(inbox_id: int, data: RetentionSettings, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    await _get_smtp_inbox(db, inbox_id)
    acct = (await db.execute(select(SmtpAccount).where(SmtpAccount.inbox_id == inbox_id).with_for_update())).scalar_one_or_none()
    if not acct:
        raise HTTPException(404, "Brak konfiguracji SMTP / IMAP.")
    if data.mode != "keep" and not data.confirm_delete:
        raise HTTPException(400, "Potwierdź usuwanie oryginałów z serwera pocztowego.")
    if data.mode != "keep" and not acct.imap_host:
        raise HTTPException(400, "Usuwanie wymaga skonfigurowanego IMAP.")
    acct.retention_mode, acct.retention_days = data.mode, data.days
    await db.flush()
    return {"mode": acct.retention_mode, "days": acct.retention_days}


@router.get("/inboxes/{inbox_id}/archive")
async def archive_status(inbox_id: int, before: int | None = Query(None, ge=1), db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    await _get_smtp_inbox(db, inbox_id)
    acct = (await db.execute(select(SmtpAccount).where(SmtpAccount.inbox_id == inbox_id))).scalar_one_or_none()
    state = (await db.execute(select(SmtpSyncState).where(SmtpSyncState.inbox_id == inbox_id))).scalar_one_or_none()
    summary = (await db.execute(select(func.count(SmtpArchive.id), func.coalesce(func.sum(SmtpArchive.size_bytes), 0)).where(SmtpArchive.inbox_id == inbox_id))).one()
    fields = [SmtpArchive.id, SmtpArchive.subject, SmtpArchive.from_address, SmtpArchive.size_bytes, SmtpArchive.archived_at, SmtpArchive.server_removed_at, SmtpArchive.removal_status, SmtpArchive.last_error]
    query = select(*fields).where(SmtpArchive.inbox_id == inbox_id)
    if before:
        query = query.where(SmtpArchive.id < before)
    rows = (await db.execute(query.order_by(SmtpArchive.id.desc()).limit(51))).mappings().all()
    return {"mode": acct.retention_mode if acct else "keep", "days": acct.retention_days if acct else 30,
            "imap_configured": bool(acct and acct.imap_host), "count": summary[0], "bytes": summary[1],
            "last_sync_at": state.last_sync_at if state else None, "sync_error": state.last_error if state else "",
            "messages": [dict(row) for row in rows[:50]], "next_before": rows[49]["id"] if len(rows)>50 else None}


@router.get("/inboxes/{inbox_id}/archive/{archive_id}/eml")
async def download_archive(inbox_id: int, archive_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    import hashlib
    await _get_smtp_inbox(db, inbox_id)
    row = (await db.execute(select(SmtpArchive).where(SmtpArchive.inbox_id == inbox_id, SmtpArchive.id == archive_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Nie znaleziono archiwum.")
    if len(row.raw_message) != row.size_bytes or hashlib.sha256(row.raw_message).hexdigest() != row.sha256:
        raise HTTPException(409, "Archiwum nie przeszło kontroli integralności.")
    return Response(row.raw_message, media_type="message/rfc822", headers={"Content-Disposition": f'attachment; filename="sekaro-{inbox_id}-{archive_id}.eml"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
