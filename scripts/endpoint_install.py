"""Endpoint roles for sekaro-install.py; no host firewall rules are changed."""
import argparse
import hashlib
from urllib.parse import urlsplit
import ipaddress
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import urllib.request
import ssl
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/'.sekaro-endpoint'


def write_private(path, text):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temp=path.with_suffix(path.suffix+'.tmp')
    fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:
        f.write(text); f.flush(); os.fsync(f.fileno())
    temp.replace(path)


def compose():
    return ['docker','compose','--env-file',str(STATE/'env'),'-f',str(ROOT/'docker-compose.endpoint.yml')]


def run(args, **kwargs):
    return subprocess.run(args,cwd=ROOT,check=True,**kwargs)


def backup():
    dest=STATE/'backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f.sqlite3')
    dest.parent.mkdir(exist_ok=True,mode=0o700)
    code="import sqlite3; s=sqlite3.connect('/data/endpoint.sqlite3'); d=sqlite3.connect('/data/snapshot.sqlite3'); s.backup(d); d.close(); s.close()"
    run(compose()+['exec','-T','endpoint','python','-c',code])
    cid=run(compose()+['ps','-q','endpoint'],capture_output=True,text=True).stdout.strip()
    run(['docker','cp',cid+':/data/snapshot.sqlite3',str(dest)])
    dest.chmod(0o600)
    print('Endpoint backup:',dest)


def main(argv):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['endpoint-install','endpoint-update','endpoint-status','endpoint-backup','endpoint-connect','endpoint-rotate','endpoint-revoke-old','endpoint-restore'])
    parser.add_argument('--public-bind',default='127.0.0.1')
    parser.add_argument('--sync-bind',default='127.0.0.1')
    parser.add_argument('--public-port',type=int,default=5051)
    parser.add_argument('--sync-port',type=int,default=5052)
    parser.add_argument('--config',type=Path,help='Private client JSON; endpoint-connect only')
    parser.add_argument('--backup-file',type=Path)
    parser.add_argument('--skip-current-backup',action='store_true',help='Restore only: use when the current endpoint volume is unavailable')
    args=parser.parse_args(argv)
    os.umask(0o077)
    if args.action=='endpoint-connect':
        if not args.config:
            parser.error('--config is required')
        cfg=json.loads(args.config.read_text())
        if cfg.get('mode') not in ('private','unsubscribe','tracking'):
            raise RuntimeError('mode must be private, unsubscribe or tracking')
        target=ROOT/'.sekaro-install/endpoint-client'
        target.mkdir(parents=True,exist_ok=True,mode=0o700)
        subject_key=target/'subject.key'
        if not subject_key.exists():
            write_private(subject_key,secrets.token_urlsafe(48)+'\n')
        cfg['subject_key_file']='/app/endpoint-config/subject.key'
        previous=target/'client.json'
        if previous.exists():
            old=json.loads(previous.read_text())
            newids={p['id'] for p in cfg.get('endpoints',[])}
            if any(p['id'] not in newids for p in old.get('endpoints',[])):
                raise RuntimeError('Keep old endpoints as retired to preserve previously issued links')
        ids=set()
        assignments=set()
        has_default=False
        epochs=set()
        pending_files={}
        old_profiles={p['id']:p for p in json.loads(previous.read_text()).get('endpoints',[])} if previous.exists() else {}
        for p in cfg.get('endpoints',[]):
            if p.get('id') in ids:
                raise RuntimeError('Duplicate endpoint id')
            ids.add(p.get('id'))
            if not isinstance(p.get('id'),str) or not p['id'].replace('-','').replace('_','').isalnum():
                raise RuntimeError('Invalid endpoint id')
            for field in ('public_url','sync_url'):
                u=urlsplit(p.get(field,''))
                if not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/'):
                    raise RuntimeError('Endpoint URLs must be origins')
                _ = u.port
                if u.scheme!='https' and not (field=='sync_url' and u.scheme=='http' and p.get('transport') in ('local','mesh','lan')):
                    raise RuntimeError('HTTPS required except explicit private synchronization transport')
            if not p.get('retired'):
                values=set(p.get('inbox_ids',[]))
                if any(type(i) is not int or i<1 for i in values) or assignments & values or (not values and has_default):
                    raise RuntimeError('Conflicting or invalid mailbox assignments')
                assignments |= values
                has_default |= not values
            key=Path(p['key_file']).read_text().strip()
            if len(key)<32:
                raise RuntimeError('Synchronization key must have at least 32 characters')
            headers={'Authorization':'Bearer '+key}
            if p.get('access_id_file'):
                headers.update({'CF-Access-Client-Id':Path(p['access_id_file']).read_text().strip(),'CF-Access-Client-Secret':Path(p['access_secret_file']).read_text().strip()})
            ctx=ssl.create_default_context(cafile=p.get('ca_file'))
            if p.get('cert_file'):
                ctx.load_cert_chain(p['cert_file'],p['cert_key_file'])
            u=urlsplit(p['sync_url'])
            if u.scheme!='https' and not (u.scheme=='http' and p.get('transport') in ('local','mesh','lan')):
                raise RuntimeError('HTTPS required except explicit private transport')
            req=urllib.request.Request(p['sync_url'].rstrip('/')+'/v1/status',headers=headers)
            # No redirect handler: never forward a synchronization secret to another host.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self,*a,**k): return None
            opener=urllib.request.build_opener(NoRedirect,urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=ctx))
            with opener.open(req,timeout=15) as r:
                response=r.read(2097153)
                if len(response)>2097152:
                    raise RuntimeError('Endpoint response too large')
                status=json.loads(response)
            if status.get('protocol')!=1:
                raise RuntimeError('Unsupported endpoint protocol')
            expected=p.get('epoch') or old_profiles.get(p['id'],{}).get('epoch')
            if expected and expected!=status.get('epoch'):
                raise RuntimeError('Endpoint state changed; recover its volume')
            if not status.get('epoch') or status['epoch'] in epochs:
                raise RuntimeError('Use one profile per endpoint store')
            epochs.add(status['epoch'])
            p['epoch']=status['epoch']
            for field in ('key_file','access_id_file','access_secret_file','ca_file','cert_file','cert_key_file'):
                if p.get(field):
                    content=Path(p[field]).read_text()
                    name=p['id']+'-'+field+'-'+hashlib.sha256(content.encode()).hexdigest()[:16]
                    pending_files[name]=content
                    p[field]='/app/endpoint-config/'+name
        for name,content in pending_files.items():
            if not (target/name).exists():
                write_private(target/name,content)
        write_private(previous,json.dumps(cfg,indent=2)+'\n')
        print('Configuration paired. Run the regular update command to mount it into Sekaro.')
        return
    if args.action=='endpoint-install':
        if (STATE/'env').exists():
            raise RuntimeError('Endpoint already configured; use endpoint-update')
        for bind in (args.public_bind,args.sync_bind):
            ipaddress.ip_address(bind)
        if not all(1<=port<=65535 for port in (args.public_port,args.sync_port)):
            raise RuntimeError('Invalid port')
        if args.public_bind==args.sync_bind and args.public_port==args.sync_port:
            raise RuntimeError('Public and synchronization ports must differ')
        write_private(STATE/'env',f'ENDPOINT_PUBLIC_BIND={args.public_bind}\nENDPOINT_SYNC_BIND={args.sync_bind}\nENDPOINT_PUBLIC_PORT={args.public_port}\nENDPOINT_SYNC_PORT={args.sync_port}\n')
        key=secrets.token_urlsafe(48)
        write_private(STATE/'server.keys',key+'\n')
        write_private(STATE/'client.key',key+'\n')
        os.chown(STATE/'server.keys',10001,10001)
    elif not (STATE/'env').exists():
        raise RuntimeError('Endpoint configuration missing')
    if args.action in ('endpoint-rotate','endpoint-revoke-old'):
        path=STATE/'server.keys'
        keys=path.read_text().splitlines()
        if args.action=='endpoint-rotate':
            keys=[secrets.token_urlsafe(48),keys[0]]
            write_private(STATE/'client.key',keys[0]+'\n')
        else:
            keys=keys[:1]
        # In-place rewrite retains the inode used by the running bind mount.
        with path.open('w') as f:
            f.write('\n'.join(keys)+'\n');f.flush();os.fsync(f.fileno())
        print('Key updated. Rotate: copy client.key securely and reconnect Sekaro; revoke-old only after verification.')
        return
    if args.action=='endpoint-status':
        run(compose()+['ps']);return
    if args.action=='endpoint-backup':
        backup();return
    if args.action=='endpoint-restore':
        if not args.backup_file:
            parser.error('--backup-file is required')
        import sqlite3
        with sqlite3.connect('file:'+str(args.backup_file.resolve())+'?mode=ro',uri=True) as db:
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise RuntimeError('Invalid SQLite backup')
            db.execute('SELECT epoch,ack FROM state').fetchone()
        if not args.skip_current_backup:
            backup()
        run(compose()+['stop','endpoint'])
        # Restore into the existing volume; no database volume belonging to Sekaro is touched.
        dest=STATE/'restore.sqlite3';shutil.copyfile(args.backup_file,dest);dest.chmod(0o644)
        run(compose()+['run','--rm','--no-deps','-v',str(dest)+':/restore.sqlite3:ro','endpoint','python','-c',"import shutil, pathlib; [p.unlink(missing_ok=True) for p in [pathlib.Path('/data/endpoint.sqlite3-wal'),pathlib.Path('/data/endpoint.sqlite3-shm')]]; shutil.copyfile('/restore.sqlite3','/data/endpoint.sqlite3')"])
        dest.unlink();run(compose()+['up','-d','--wait']);return
    if args.action=='endpoint-update':
        backup()
    revision=run(['git','rev-parse','HEAD'],capture_output=True,text=True).stdout.strip()
    run(['docker','build','-f','Dockerfile.endpoint','--label','org.opencontainers.image.revision='+revision,'-t','sekaro-endpoint:local','.'])
    run(compose()+['up','-d','--wait','--wait-timeout','120'])
    print('Endpoint ready. Public listener and synchronization listener must have separate proxy routes.')
    print('Key transfer file:',STATE/'client.key')
    print('Restrict synchronization to the Sekaro host/VPN identity; test IPv4 and IPv6. Docker published ports may bypass UFW INPUT.')
