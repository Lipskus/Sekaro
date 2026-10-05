"""Encrypt legacy Gmail and Microsoft credentials without changing their schema or deleting data."""
from sqlalchemy import text
from app.security import encrypt, encryption_enabled, is_encrypted

async def migrate_mail_credentials(conn):
    if not encryption_enabled():
        return 0
    if conn.dialect.name == 'postgresql':
        await conn.execute(text('SELECT pg_advisory_xact_lock(736209)'))
    changed = 0
    for table in ("gmail_account", "office365_account"):
        changed += await _migrate_table(conn, table)
    return changed

async def _migrate_table(conn, table):
    rows = (await conn.execute(text(f'SELECT id, access_token, refresh_token FROM {table}'))).mappings().all()
    changed = 0
    for row in rows:
        for column in ('access_token', 'refresh_token'):
            old = row[column]
            if old and not is_encrypted(old):
                # Compare-and-swap also protects a refresh performed by an already-running worker.
                result = await conn.execute(text(f'UPDATE {table} SET {column}=:new WHERE id=:id AND {column}=:old'),
                    {'id': row['id'], 'old': old, 'new': encrypt(old)})
                changed += result.rowcount
    return changed
