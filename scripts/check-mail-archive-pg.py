"""CI-only archive upgrade and pg_dump/restore verification in an isolated schema."""
import asyncio
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.engine import make_url
from app.database import Base, _run_migrations
from app.models import Inbox, SmtpAccount, SmtpArchive, SmtpSyncState


async def main():
    url = os.environ['ARCHIVE_PG_TEST_URL']  # Explicit opt-in; never use the app's database URL.
    parsed = make_url(url)
    assert parsed.database == 'sekaro_demo' and parsed.host == '127.0.0.1', 'CI database only'
    schema = 'archive_qa_' + uuid.uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA {schema}'))
    engine = create_async_engine(url, connect_args={'server_settings': {'search_path': schema}})
    Session = async_sessionmaker(engine, expire_on_commit=False)
    raw = b'From: qa@example.test\r\nSubject: archive\r\n\r\n\x00\xffattachment\r\n'
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with Session() as db:
            inbox = Inbox(email='upgrade@example.test', provider='smtp')
            db.add(inbox)
            await db.flush()
            db.add(SmtpAccount(inbox_id=inbox.id, smtp_host='smtp.example.test'))
            db.add(SmtpSyncState(inbox_id=inbox.id, uidvalidity=77, last_uid=99))
            await db.commit()
            inbox_id = inbox.id
        # Simulate a database from the preceding release, retaining its records.
        async with engine.begin() as conn:
            await conn.execute(text('DROP TABLE smtp_archive'))
            for table, column in [('smtp_account', 'retention_mode'), ('smtp_account', 'retention_days'), ('smtp_sync_state', 'archive_last_uid'), ('smtp_sync_state', 'last_error')]:
                await conn.execute(text(f'ALTER TABLE {table} DROP COLUMN {column}'))
        for _ in range(2):  # Startup migrations must be repeatable.
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                await _run_migrations(conn)
        async with Session() as db:
            acct = (await db.execute(select(SmtpAccount))).scalar_one()
            state = (await db.execute(select(SmtpSyncState))).scalar_one()
            assert acct.retention_mode == 'keep' and acct.retention_days == 30
            assert state.last_uid == 99 and state.archive_last_uid == 0
            db.add(SmtpArchive(inbox_id=inbox_id, source_key='qa', uidvalidity=77, uid=42,
                               raw_message=raw, size_bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
            await db.commit()
        # Standard custom-format PostgreSQL dump; no archive file volume is needed.
        uri = parsed.set(drivername='postgresql', password=None).render_as_string(hide_password=False)
        env = {**os.environ, 'PGPASSWORD': parsed.password or ''}
        with tempfile.TemporaryDirectory() as temp:
            dump = str(Path(temp) / 'archive.dump')
            subprocess.run(['pg_dump', '-Fc', '--no-owner', '--schema', schema, '-d', uri, '-f', dump], env=env, check=True)
            await engine.dispose()
            async with admin.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA {schema} CASCADE'))
            subprocess.run(['pg_restore', '--no-owner', '--exit-on-error', '-d', uri, dump], env=env, check=True)
            async with Session() as db:
                row = (await db.execute(select(SmtpArchive))).scalar_one()
                assert row.raw_message == raw and row.sha256 == hashlib.sha256(raw).hexdigest()
        print('Archive upgrade, repeat startup, safe defaults and PostgreSQL backup roundtrip: OK')
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS {schema} CASCADE'))
        await admin.dispose()


asyncio.run(main())
