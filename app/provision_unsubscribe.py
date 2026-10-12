"""Run privately: python -m app.provision_unsubscribe. No password in argv/output."""
import asyncio
import os
import re
from pathlib import Path
import asyncpg
from app.backup_pg import sync_connection_uri


async def provision():
    password = os.environ.get("SEKARO_UNSUBSCRIBE_PASSWORD", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", password):
        raise RuntimeError("SEKARO_UNSUBSCRIBE_PASSWORD must contain 32–128 URL-safe random characters")
    connection = await asyncpg.connect(sync_connection_uri(os.environ["DATABASE_URL"]))
    try:
        async with connection.transaction():
            role = await connection.fetchrow("SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sekaro_unsubscribe'")
            if role and any(role.values()):
                raise RuntimeError("Refusing an existing privileged unsubscribe role")
            if await connection.fetchval("SELECT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='sekaro_unsubscribe')"):
                raise RuntimeError("Unsubscribe role must not inherit other roles")
            if await connection.fetchval("SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname='sekaro_unsubscribe')"):
                raise RuntimeError("Unsubscribe role must not own database relations")
            if not role:
                await connection.execute("CREATE ROLE sekaro_unsubscribe LOGIN NOINHERIT")
            ddl = await connection.fetchval("SELECT format('ALTER ROLE sekaro_unsubscribe PASSWORD %L', $1::text)", password)
            await connection.execute(ddl)
            await connection.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sekaro_unsubscribe")
            await connection.execute("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM sekaro_unsubscribe")
            await connection.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
            if await connection.fetchval("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege('sekaro_unsubscribe', format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE'))"):
                raise RuntimeError("Unsubscribe role still has table access through PUBLIC grants; review database privileges")
        await connection.execute(Path(__file__).with_name('unsubscribe.sql').read_text())
    finally:
        await connection.close()
    print("Restricted unsubscribe role and function installed.")


if __name__ == '__main__':
    asyncio.run(provision())
