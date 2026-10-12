"""One-time CRM backfill; old fields and email stay intact for existing templates."""
from sqlalchemy import text

async def migrate_crm(conn):
    if conn.dialect.name != 'postgresql':
        return
    await conn.execute(text('SELECT pg_advisory_xact_lock(73620261005)'))
    # Use a dedicated marker: the historic migration ledger has its own schema.
    await conn.execute(text('CREATE TABLE IF NOT EXISTS _crm_schema_migrations (key VARCHAR(100) PRIMARY KEY)'))
    done = (await conn.execute(text("SELECT 1 FROM _crm_schema_migrations WHERE key='stage5-initial'"))).first()
    if done: return
    await conn.execute(text("INSERT INTO crm_profile(lead_id,kind) SELECT id,'unspecified' FROM lead ON CONFLICT DO NOTHING"))
    # Each legacy record gets an explicit company proposal. Identical names are not identity proof.
    rows=(await conn.execute(text("SELECT id, custom_data FROM lead ORDER BY id"))).all()
    import json
    for lead_id,custom in rows:
        if isinstance(custom,str): custom=json.loads(custom)
        if not isinstance(custom,dict): continue
        name=next((custom[k].strip() for k in ('company','firma','Company','Firma') if isinstance(custom.get(k),str) and custom[k].strip()),None)
        if not name: continue
        company_id=(await conn.execute(text("INSERT INTO crm_company(name,domain,description,created_at) VALUES (:name,'',:description,CURRENT_TIMESTAMP) RETURNING id"),{'name':name[:255],'description':f'Imported from contact #{lead_id}; company identity requires review.'})).scalar_one()
        await conn.execute(text("INSERT INTO crm_company_contact(company_id,lead_id,role) VALUES (:company,:lead,'')"),{'company':company_id,'lead':lead_id})
    await conn.execute(text("INSERT INTO _crm_schema_migrations(key) VALUES ('stage5-initial')"))
