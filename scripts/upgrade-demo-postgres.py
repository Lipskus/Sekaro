#!/usr/bin/env python3
"""Explicit PG15→17 logical upgrade of the existing demo. No production selectors.

Stops demo writes, verifies a restore on a new volume, then switches the DB service.
Never deletes either data volume. Run only after building the stage-4 app image.
"""
import json
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.sekaro-demo'
OVERRIDE = STATE / 'pg17.compose.json'
COMPOSE = ['docker', 'compose', '--env-file', str(STATE/'env'), '-p', 'sekaro-demo', '-f', str(ROOT/'docker-compose.demo.yml')]


def run(args, **kw):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kw).stdout


def signatures(container, user, database):
    prefix=['docker','exec',container,'psql','-X','-v','ON_ERROR_STOP=1','-U',user,'-d',database,'-Atc']
    tables=run(prefix+["SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"]).decode().splitlines()
    # Quote identifiers from PostgreSQL, never concatenate them as executable shell.
    result={}
    for table in tables:
        quoted='"'+table.replace('"','""')+'"'
        sql = ("SELECT json_build_object('rows',count(*),'hash_a',coalesce(sum(('x'||substr(md5(to_jsonb(t)::text),1,16))::bit(64)::bigint::numeric),0)::text,"
               "'hash_b',coalesce(sum(('x'||substr(md5(to_jsonb(t)::text),17,16))::bit(64)::bigint::numeric),0)::text) "
               'FROM public.'+quoted+' t')
        result[table]=json.loads(run(prefix+[sql]))
    return result


def upgrade():
    os.chdir(ROOT);os.umask(0o077)
    if OVERRIDE.exists():
        raise RuntimeError('PG17 override already exists. Do not rerun; use the saved runbook for verification or rollback.')
    config=json.loads(run(COMPOSE+['config','--format','json']))
    db_env=config['services']['demo-db']['environment']
    user,database,password=(db_env[k] for k in ('POSTGRES_USER','POSTGRES_DB','POSTGRES_PASSWORD'))
    source=run(COMPOSE+['ps','-q','demo-db']).decode().strip()
    if not source:raise RuntimeError('Start the existing demo database first')
    version=int(run(['docker','exec',source,'psql','-X','-U',user,'-d',database,'-Atc','SHOW server_version_num']))
    if not 150000 <= version < 160000:raise RuntimeError('This upgrade supports PostgreSQL 15 only')
    # Pull before downtime; env password never appears in docker argv.
    run(['docker','pull','postgres:17-alpine'])
    name='sekaro-pg17-check-'+secrets.token_hex(4)
    volume=name+'-data'
    backup=STATE/(name+'.dump')
    switched=False;created=False
    run(COMPOSE+['stop','demo-app'])
    try:
        before=signatures(source,user,database)
        with backup.open('xb') as stream:
            subprocess.run(['docker','exec',source,'pg_dump','-U',user,'-d',database,'-Fc','--no-owner','--no-acl'],stdout=stream,stderr=subprocess.PIPE,check=True)
        env={**os.environ,'POSTGRES_PASSWORD':password}
        run(['docker','run','-d','--name',name,'--network','none','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER='+user,'-e','POSTGRES_DB='+database,'-v',volume+':/var/lib/postgresql/data','postgres:17-alpine'],env=env)
        created=True
        for _ in range(60):
            if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U',user,'-d',database],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('Target database did not become ready')
        with backup.open('rb') as stream:
            run(['docker','exec','-i',name,'pg_restore','-U',user,'-d',database,'--no-owner','--no-acl','--single-transaction','--exit-on-error'],stdin=stream)
        after=signatures(name,user,database)
        if before!=after:raise RuntimeError('Restored table data signatures differ; source remains authoritative')
        report={'source_major':15,'target_major':17,'backup':str(backup),'target_volume':volume,'table_signatures':after}
        (STATE/(name+'.json')).write_text(json.dumps(report,indent=2))
        run(['docker','stop',name]);run(['docker','rm',name]);created=False
        override={'services':{'demo-db':{'image':'postgres:17-alpine','volumes':[volume+':/var/lib/postgresql/data']}},'volumes':{volume:{'external':True}}}
        OVERRIDE.write_text(json.dumps(override,indent=2))
        switched=True
        run(COMPOSE+['-f',str(OVERRIDE),'up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','180','demo-db'])
        run(COMPOSE+['-f',str(OVERRIDE),'up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','180','demo-app'])
        print('PG15 → PG17: restore and all public table data signatures verified.')
        print('Upgrade override: '+str(OVERRIDE))
        print('Backup and old volume retained. Use scripts/sekaro-demo.sh for future updates.')
    except Exception:
        if switched:
            OVERRIDE.rename(STATE/(name+'-failed-override.json'))
            run(COMPOSE+['up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','180','demo-db'])
        run(COMPOSE+['up','-d','--no-deps','--wait','--wait-timeout','180','demo-app'])
        raise
    finally:
        if created:
            subprocess.run(['docker','stop',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            subprocess.run(['docker','rm',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


if __name__=='__main__':
    try:upgrade()
    except Exception as exc:
        # CalledProcessError stderr/config may contain connection credentials.
        print('Upgrade failed: '+ (str(exc) if not isinstance(exc,subprocess.CalledProcessError) else 'Docker/PostgreSQL command failed; original volume and backup retained.'),file=sys.stderr)
        sys.exit(1)
