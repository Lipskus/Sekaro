"""Encrypt legacy Gmail credentials without changing their schema or deleting data."""
from sqlalchemy import text
from app.security import encrypt, encryption_enabled, is_encrypted

async def migrate_mail_credentials(conn):
    if not encryption_enabled():
        return 0
    if conn.dialect.name == 'postgresql':
        await conn.execute(text('SELECT pg_advisory_xact_lock(736209)'))
    rows = (await conn.execute(text('SELECT id, access_token, refresh_token FROM gmail_account'))).mappings().all()
    changed = 0
    for row in rows:
        for column in ('access_token', 'refresh_token'):
            old = row[column]
            if old and not is_encrypted(old):
                # Compare-and-swap also protects a refresh performed by an already-running worker.
                result = await conn.execute(text(f'UPDATE gmail_account SET {column}=:new WHERE id=:id AND {column}=:old'),
                    {'id': row['id'], 'old': old, 'new': encrypt(old)})
                changed += result.rowcount
    return changed
