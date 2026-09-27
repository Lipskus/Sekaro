"""Archive durability, retention boundaries and exact-UID deletion safety."""
from datetime import timedelta
from email.message import EmailMessage
from types import SimpleNamespace
import hashlib

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app import mail_archive as archive
from app.models import Inbox, SmtpAccount, SmtpArchive, SmtpSyncState
from app.routers import smtp
from app.smtp_utils import parse_imap_message
from app.time import utcnow


def raw_mail():
    msg = EmailMessage()
    msg['From'] = 'friend@example.test'
    msg['To'] = 'me@example.test'
    msg['Subject'] = 'Attachment preserved'
    msg['Date'] = 'Mon, 01 Jan 2001 00:00:00 +0000'
    msg.set_content('Complete message')
    msg.add_attachment(b'\x00\xff\x01attachment', maintype='application', subtype='octet-stream', filename='data.bin')
    msg.set_boundary('deterministic-test-boundary')
    return msg.as_bytes()


def account(**kw):
    return SimpleNamespace(inbox_id=1, imap_host='imap.example.test', imap_port=993, imap_username='me', **kw)


def record(acct=None):
    raw = raw_mail()
    return SimpleNamespace(raw_message=raw, size_bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                           source_key=archive.source_key(acct or account()), uidvalidity=77, uid=42)


class FakeIMAP:
    capabilities = (b'IMAP4rev1', b'UIDPLUS')
    def __init__(self, raw=None, validity=77, expunge='OK'):
        self.raw = raw if raw is not None else raw_mail()
        self.validity, self.expunge = validity, expunge
        self.calls = []
    def select(self, *args, **kw):
        self.calls.append(('select', args, kw))
        return 'OK', []
    def status(self, *args):
        return 'OK', [f'INBOX (UIDVALIDITY {self.validity})'.encode()]
    def uid(self, command, *args):
        self.calls.append((command, *args))
        if command == 'fetch':
            return 'OK', [(f'1 (UID {args[0]} RFC822.SIZE {len(self.raw)} BODY[] {{{len(self.raw)}}})'.encode(), self.raw)] if self.raw else [None]
        if command == 'search':
            return 'OK', [b'41 42 43']
        return (self.expunge if command == 'expunge' else 'OK'), []
    def logout(self):
        self.calls.append(('logout',))


def test_only_exact_verified_uid_is_deleted(monkeypatch):
    client = FakeIMAP()
    monkeypatch.setattr(archive, '_imap_connect', lambda *a, **k: client)
    assert archive.remove_archived_message(account(), record()) == 'deleted'
    assert ('store', '42', '+FLAGS.SILENT', r'(\Deleted)') in client.calls
    assert ('expunge', '42') in client.calls
    assert all(call[0] != 'close' for call in client.calls)


@pytest.mark.parametrize('failure', ['capability', 'validity', 'raw', 'corrupt', 'source', 'malformed'])
def test_unsafe_original_is_never_marked_deleted(monkeypatch, failure):
    client, row = FakeIMAP(), record()
    if failure == 'capability': client.capabilities = (b'IMAP4rev1',)
    if failure == 'validity': client.validity = 78
    if failure == 'raw': client.raw = b'other message'
    if failure == 'corrupt': row.raw_message = b'corrupt'
    if failure == 'source': row.source_key = 'other'
    if failure == 'malformed':
        original = client.uid
        client.uid = lambda cmd, *a: ('OK', [b'bad fetch']) if cmd == 'fetch' else original(cmd, *a)
    monkeypatch.setattr(archive, '_imap_connect', lambda *a, **k: client)
    with pytest.raises(ValueError): archive.remove_archived_message(account(), row)
    assert not any(c[0] in ('store', 'expunge') for c in client.calls)


def test_retry_after_server_deletion_is_idempotent(monkeypatch):
    client = FakeIMAP(raw=b'')
    monkeypatch.setattr(archive, '_imap_connect', lambda *a, **k: client)
    assert archive.remove_archived_message(account(), record()) == 'absent'
    assert not any(c[0] in ('store', 'expunge') for c in client.calls)


def test_failed_expunge_removes_our_flag(monkeypatch):
    client = FakeIMAP(expunge='NO')
    monkeypatch.setattr(archive, '_imap_connect', lambda *a, **k: client)
    with pytest.raises(ValueError): archive.remove_archived_message(account(), record())
    assert ('store', '42', '-FLAGS.SILENT', r'(\Deleted)') in client.calls


@pytest.mark.asyncio
async def test_full_archive_roundtrip_policy_and_integrity(session):
    inbox = Inbox(email='me@example.test', provider='smtp')
    session.add(inbox)
    await session.flush()
    acct = SmtpAccount(inbox_id=inbox.id, smtp_host='smtp.example.test', imap_host='imap.example.test', imap_username='me')
    session.add(acct)
    await session.flush()
    assert acct.retention_mode == 'keep'
    raw = raw_mail()
    row = await archive.archive_message(session, acct, 77, 42, raw, parse_imap_message(raw))
    assert (await archive.archive_message(session, acct, 77, 42, raw, parse_imap_message(raw))).id == row.id
    await session.commit()
    response = await smtp.download_archive(inbox.id, row.id, db=session, _user=object())
    assert response.body == raw
    assert 'attachment;' in response.headers['content-disposition']
    status = await smtp.archive_status(inbox.id, before=None, db=session, _user=object())
    assert status['count'] == 1 and status['bytes'] == len(raw)
    assert 'raw_message' not in status['messages'][0]
    with pytest.raises(HTTPException) as exc:
        await smtp.update_retention(inbox.id, smtp.RetentionSettings(mode='immediate'), db=session, _user=object())
    assert exc.value.status_code == 400
    await smtp.update_retention(inbox.id, smtp.RetentionSettings(mode='days', days=14, confirm_delete=True), db=session, _user=object())
    assert acct.retention_days == 14
    row.raw_message = b'corrupted'
    await session.flush()
    with pytest.raises(HTTPException) as exc:
        await smtp.download_archive(inbox.id, row.id, db=session, _user=object())
    assert exc.value.status_code == 409
    with pytest.raises(ValueError):
        await archive.archive_message(session, acct, 77, 42, raw, parse_imap_message(raw))


@pytest.mark.parametrize('days', [0, -1, 3651])
def test_invalid_retention_days(days):
    with pytest.raises(ValidationError): smtp.RetentionSettings(mode='days', days=days)


@pytest.mark.asyncio
async def test_retention_uses_committed_archive_age_and_preserves_failures(session, engine, monkeypatch):
    inbox = Inbox(email='me@example.test', provider='smtp')
    session.add(inbox)
    await session.flush()
    acct = SmtpAccount(inbox_id=inbox.id, smtp_host='smtp.example.test', imap_host='imap.example.test', imap_username='me', retention_mode='days', retention_days=7)
    session.add(acct)
    await session.flush()
    raw = raw_mail()
    rows = [await archive.archive_message(session, acct, 77, uid, raw, parse_imap_message(raw)) for uid in range(1, 5)]
    rows[0].archived_at = rows[1].archived_at = utcnow() - timedelta(days=8)
    rows[3].archived_at = utcnow() - timedelta(days=8)
    rows[3].source_key = 'old mailbox'
    await session.commit()
    monkeypatch.delenv('SEKARO_DEMO_MODE', raising=False)
    monkeypatch.setattr(archive, 'AsyncSessionLocal', async_sessionmaker(engine, expire_on_commit=False))
    called = []
    def remove(acct, row):
        called.append(row.uid)
        if row.uid == 2: raise RuntimeError('secret provider response')
        return 'deleted'
    monkeypatch.setattr(archive, 'remove_archived_message', remove)
    await archive.process_retention(inbox.id)
    assert called == [1, 2]  # Mail Date is 2001, but recently archived UID 3 stays.
    for row in rows: await session.refresh(row)
    assert rows[0].server_removed_at is not None and rows[0].raw_message == raw
    assert rows[1].server_removed_at is None and rows[1].removal_status == 'error'
    assert 'secret' not in rows[1].last_error
    assert rows[2].server_removed_at is None and rows[3].server_removed_at is None
    acct.retention_mode = 'keep'
    await session.commit()
    called.clear()
    await archive.process_retention(inbox.id)
    assert called == []


@pytest.mark.asyncio
async def test_rolled_back_archive_cannot_trigger_removal(session, engine, monkeypatch):
    inbox = Inbox(email='me@example.test', provider='smtp')
    session.add(inbox)
    await session.flush()
    inbox_id = inbox.id
    acct = SmtpAccount(inbox_id=inbox_id, smtp_host='smtp.example.test', imap_host='imap.example.test', imap_username='me', retention_mode='immediate')
    session.add(acct)
    await session.commit()
    raw = raw_mail()
    await archive.archive_message(session, acct, 77, 42, raw, parse_imap_message(raw))
    await session.rollback()
    monkeypatch.delenv('SEKARO_DEMO_MODE', raising=False)
    monkeypatch.setattr(archive, 'AsyncSessionLocal', async_sessionmaker(engine, expire_on_commit=False))
    def forbidden(*args): raise AssertionError('Uncommitted mail must not be deleted')
    monkeypatch.setattr(archive, 'remove_archived_message', forbidden)
    await archive.process_retention(inbox_id)
    assert not (await session.execute(select(SmtpArchive))).scalars().all()


def test_fetch_backfills_oldest_without_skipping_partial_messages(monkeypatch):
    from app.unibox import _fetch_smtp_new_messages
    client = FakeIMAP()
    monkeypatch.setattr('app.smtp_utils._imap_connect', lambda *a, **kw: client)
    validity, fetched = _fetch_smtp_new_messages(account(), None, 999, cap=2)
    assert validity == 77 and [uid for uid, raw in fetched] == [41, 42]
    original = client.uid
    def partial(cmd, *args):
        if cmd == 'fetch' and args[0] == '42': return 'OK', [(b'2 (RFC822.SIZE 999 BODY[] {3})', b'bad')]
        return original(cmd, *args)
    client.uid = partial
    with pytest.raises(ValueError, match='incomplete'):
        _fetch_smtp_new_messages(account(), 77, 40, cap=3)
    client.status = lambda *args: ('NO', [])
    with pytest.raises(ValueError, match='UIDVALIDITY'):
        _fetch_smtp_new_messages(account(), 77, 40)


@pytest.mark.asyncio
async def test_source_change_resets_policy_checkpoint_and_preserves_archive(session):
    inbox = Inbox(email='me@example.test', provider='smtp')
    session.add(inbox)
    await session.flush()
    acct = SmtpAccount(inbox_id=inbox.id, smtp_host='smtp.example.test', smtp_password='secret', imap_host='imap.example.test', imap_username='me', imap_password='secret', retention_mode='immediate')
    state = SmtpSyncState(inbox_id=inbox.id, uidvalidity=77, last_uid=99, archive_last_uid=99)
    session.add_all([acct, state])
    await session.flush()
    raw = raw_mail()
    await archive.archive_message(session, acct, 77, 42, raw, parse_imap_message(raw))
    await smtp.upsert_smtp_account(inbox.id, smtp.SmtpAccountUpsert(smtp_host='smtp.example.test', smtp_username='me', imap_host='new.example.test', imap_username='me'), db=session, _user=object())
    assert acct.retention_mode == 'keep' and state.archive_last_uid == 0 and state.uidvalidity is None
    assert len((await session.execute(select(SmtpArchive))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_download_is_bound_to_inbox_and_send_only_cannot_delete(session):
    boxes = [Inbox(email=f'{n}@example.test', provider='smtp') for n in range(2)]
    session.add_all(boxes)
    await session.flush()
    acct = SmtpAccount(inbox_id=boxes[0].id, smtp_host='smtp.example.test', imap_host='')
    session.add(acct)
    await session.flush()
    row = await archive.archive_message(session, acct, 77, 42, raw_mail(), {})
    with pytest.raises(HTTPException) as exc:
        await smtp.download_archive(boxes[1].id, row.id, db=session, _user=object())
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        await smtp.update_retention(boxes[0].id, smtp.RetentionSettings(mode='immediate', confirm_delete=True), db=session, _user=object())
    assert exc.value.status_code == 400


def test_fetch_accepts_size_after_mime_literal(monkeypatch):
    from app.unibox import _fetch_smtp_new_messages
    client = FakeIMAP()
    original = client.uid
    raw = raw_mail()
    def reordered(cmd, *args):
        if cmd == 'fetch':
            return 'OK', [(b'1 (BODY[] {100}', raw), f' RFC822.SIZE {len(raw)})'.encode()]
        return original(cmd, *args)
    client.uid = reordered
    monkeypatch.setattr('app.smtp_utils._imap_connect', lambda *a, **kw: client)
    _, fetched = _fetch_smtp_new_messages(account(), 77, 40, cap=1)
    assert fetched == [(41, raw)]
