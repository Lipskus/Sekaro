"""Durable IMAP archive and conservative post-commit retention processing."""
from __future__ import annotations

import asyncio
import hashlib
import os
import re
from datetime import timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import SmtpAccount, SmtpArchive
from app.smtp_utils import _imap_connect
from app.time import utcnow


def source_key(account):
    # The IMAP namespace changes when any of these settings changes.
    value = f"{account.imap_host.strip().lower()}\0{account.imap_port}\0{account.imap_username}\0INBOX"
    return hashlib.sha256(value.encode()).hexdigest()


async def archive_message(db, account, validity, uid, raw, parsed):
    if not validity or not raw:
        raise ValueError("Cannot archive an unidentified or empty IMAP message")
    key = source_key(account)
    existing = (await db.execute(select(SmtpArchive).where(
        SmtpArchive.inbox_id == account.inbox_id, SmtpArchive.source_key == key,
        SmtpArchive.uidvalidity == validity, SmtpArchive.uid == uid,
    ))).scalar_one_or_none()
    digest = hashlib.sha256(raw).hexdigest()
    if existing:
        if existing.sha256 != digest or existing.raw_message != raw or existing.size_bytes != len(raw):
            raise ValueError("IMAP identity points to different message bytes")
        return existing
    row = SmtpArchive(inbox_id=account.inbox_id, source_key=key, uidvalidity=validity,
                      uid=uid, raw_message=raw, sha256=digest, size_bytes=len(raw),
                      subject=parsed.get("subject", ""), from_address=parsed.get("from", ""))
    db.add(row)
    await db.flush()
    return row


class RetentionBlocked(ValueError):
    """A safe, user-facing reason for leaving an original untouched."""


def remove_archived_message(account, archive):
    """Delete exactly one matching UID; never use blanket EXPUNGE or CLOSE."""
    if len(archive.raw_message) != archive.size_bytes or hashlib.sha256(archive.raw_message).hexdigest() != archive.sha256:
        raise RetentionBlocked("Archiwum nie przeszło kontroli integralności.")
    if source_key(account) != archive.source_key:
        raise RetentionBlocked("Konfiguracja serwera zmieniła się; oryginał pozostawiono.")
    client = _imap_connect(account, timeout=30)
    try:
        caps = {c.decode().upper() if isinstance(c, bytes) else c.upper() for c in client.capabilities}
        if not ({"UIDPLUS", "IMAP4REV2"} & caps):
            raise RetentionBlocked("Serwer nie obsługuje bezpiecznego UID EXPUNGE; oryginał pozostawiono.")
        typ, _ = client.select("INBOX", readonly=False)
        if typ != "OK":
            raise RetentionBlocked("Nie można otworzyć INBOX do usunięcia wiadomości.")
        typ, data = client.status("INBOX", "(UIDVALIDITY)")
        match = re.search(rb"UIDVALIDITY\s+(\d+)", data[0] or b"") if typ == "OK" and data else None
        if not match or int(match[1]) != archive.uidvalidity:
            raise RetentionBlocked("Identyfikator skrzynki zmienił się; oryginał pozostawiono.")
        uid = str(archive.uid)
        typ, data = client.uid("fetch", uid, "(BODY.PEEK[])")
        if typ != "OK":
            raise RetentionBlocked("Nie udało się sprawdzić oryginału wiadomości.")
        payloads = [p[1] for p in data or [] if isinstance(p, tuple) and isinstance(p[1], bytes)]
        if not payloads:
            if not data or all(part in (None, b"") for part in data):
                return "absent"
            raise RetentionBlocked("Nie udało się potwierdzić zawartości oryginału.")
        if len(payloads) != 1 or hashlib.sha256(payloads[0]).hexdigest() != archive.sha256:
            raise RetentionBlocked("Oryginał różni się od archiwum; pozostawiono go na serwerze.")
        typ, _ = client.uid("store", uid, "+FLAGS.SILENT", r"(\Deleted)")
        if typ != "OK":
            raise RetentionBlocked("Serwer odmówił oznaczenia wiadomości do usunięcia.")
        try:
            typ, _ = client.uid("expunge", uid)
            if typ != "OK":
                raise RetentionBlocked("Serwer nie potwierdził usunięcia wiadomości.")
        except Exception:
            # Best effort undo our marker also after a dropped connection.
            try:
                client.uid("store", uid, "-FLAGS.SILENT", r"(\Deleted)")
            except Exception:
                pass
            raise
        return "deleted"
    finally:
        try:
            client.logout()
        except Exception:
            pass


async def process_retention(inbox_id):
    # Independent session only sees committed archives. Demo never touches mail servers.
    if os.environ.get("SEKARO_DEMO_MODE") == "1":
        return
    async with AsyncSessionLocal() as db:
        account = (await db.execute(select(SmtpAccount).where(SmtpAccount.inbox_id == inbox_id).with_for_update())).scalar_one_or_none()
        if not account or account.retention_mode == "keep" or not account.imap_host:
            return
        if account.retention_mode not in {"immediate", "days"}:
            return
        cutoff = utcnow() - timedelta(days=account.retention_days if account.retention_mode == "days" else 0)
        ids = (await db.execute(select(SmtpArchive.id).where(
            SmtpArchive.inbox_id == inbox_id, SmtpArchive.source_key == source_key(account),
            SmtpArchive.server_removed_at.is_(None), SmtpArchive.archived_at <= cutoff,
        ).order_by(SmtpArchive.last_attempt_at.asc().nullsfirst(), SmtpArchive.id).limit(20))).scalars().all()
        for archive_id in ids:
            archive = await db.get(SmtpArchive, archive_id)
            archive.last_attempt_at = utcnow()
            try:
                status = await asyncio.to_thread(remove_archived_message, account, archive)
                archive.server_removed_at = utcnow()
                archive.removal_status = status
                archive.last_error = ""
            except Exception as exc:
                # Never expose provider responses/credentials in diagnostics.
                archive.last_error = str(exc) if isinstance(exc, RetentionBlocked) else "Błąd połączenia podczas usuwania; operacja zostanie ponowiona."
                archive.removal_status = "error"
            await db.flush()
        await db.commit()
