"""Optional encrypted remote backups. Provider credentials never leave this module/API boundary."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import os
import re
import ssl
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from ftplib import FTP_TLS
from urllib.parse import urlsplit

from sqlalchemy import Column, Integer, String, Text, select
from app.database import Base, AsyncSessionLocal
from app.security import EncryptedText
from app.backup_package import read_backup_metadata
from app.backup_pg import resolve_backup_directory, local_disk_backups_enabled

MAX_BYTES = 512 * 1024 * 1024
NAME = re.compile(r'^sekaro-\d{8}T\d{12}Z-[a-f0-9]{12}\.qbk$')
SECRET_FIELDS = {'password', 'secret_key', 'access_key'}


class RemoteBackupTarget(Base):
    __tablename__ = 'remote_backup_targets'
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=1)
    config = Column(EncryptedText, nullable=False)
    namespace = Column(String(32), nullable=False)


class BackupTransfer(Base):
    __tablename__ = 'backup_transfers'
    id = Column(Integer, primary_key=True)
    created_at = Column(String(40), nullable=False)
    filename = Column(String(120), nullable=False)
    status = Column(String(32), nullable=False)
    detail = Column(Text, nullable=False, default='')
    checksum = Column(String(64), nullable=False, default='')


def validate_config(cfg: dict) -> dict:
    allowed = {'enabled', 'kind', 'host', 'port', 'username', 'password', 'fingerprint',
               'endpoint', 'region', 'bucket', 'prefix', 'access_key', 'secret_key', 'retention'}
    if set(cfg) - allowed:
        raise ValueError('Unknown remote backup option')
    c = dict(cfg)
    if c.get('kind') not in {'s3', 'sftp', 'ftps'}:
        raise ValueError('Choose S3, SFTP or FTPS; plaintext FTP is not supported')
    for key, value in c.items():
        if key not in {'enabled', 'port', 'retention'}:
            if not isinstance(value, str) or len(value) > 2048 or any(ch in value for ch in '\r\n\x00'):
                raise ValueError('Invalid remote backup field')
    if not isinstance(c.get('enabled', False), bool):
        raise ValueError('enabled must be boolean')
    c['retention'] = int(c.get('retention', 14))
    if not 1 <= c['retention'] <= 365:
        raise ValueError('Retention must be between 1 and 365 backups')
    prefix = c.get('prefix', 'sekaro').strip('/')
    if not re.fullmatch(r'[A-Za-z0-9_./-]{1,200}', prefix) or any(p in {'.', '..', ''} for p in prefix.split('/')):
        raise ValueError('Use a relative backup directory without traversal')
    c['prefix'] = prefix
    if c['kind'] == 's3':
        endpoint = c.get('endpoint', '')
        if endpoint:
            u = urlsplit(endpoint)
            if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in {'', '/'}:
                raise ValueError('S3 endpoint must be an HTTPS origin without credentials')
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', c.get('bucket', '')):
            raise ValueError('Invalid S3 bucket name')
        if not c.get('access_key') or not c.get('secret_key'):
            raise ValueError('S3 credentials are required')
    else:
        if not re.fullmatch(r'[A-Za-z0-9.:-]{1,253}', c.get('host', '')):
            raise ValueError('Invalid server hostname')
        c['port'] = int(c.get('port') or (22 if c['kind'] == 'sftp' else 21))
        if not 1 <= c['port'] <= 65535 or not c.get('username') or not c.get('password'):
            raise ValueError('Server port, username and password are required')
        if c['kind'] == 'sftp' and not re.fullmatch(r'SHA256:[A-Za-z0-9+/]{43}', c.get('fingerprint', '')):
            raise ValueError('SFTP requires a verified SHA256 host key fingerprint')
    return c


class LimitedBuffer(io.BytesIO):
    def write(self, data):
        if self.tell() + len(data) > MAX_BYTES:
            raise ValueError('Backup exceeds the 512 MiB transfer limit')
        return super().write(data)


@contextmanager
def remote_store(c, namespace):
    """One namespace per installation; retention cannot touch another installation."""
    prefix = c['prefix'] + '/' + namespace + '/'
    if c['kind'] == 's3':
        import boto3
        from botocore.config import Config
        client = boto3.client('s3', endpoint_url=c.get('endpoint') or None,
            region_name=c.get('region') or 'us-east-1', aws_access_key_id=c['access_key'],
            aws_secret_access_key=c['secret_key'], config=Config(connect_timeout=10, read_timeout=30, retries={'max_attempts': 2}))
        class Store:
            def put(self, name, data):
                client.put_object(Bucket=c['bucket'], Key=prefix + name, Body=data)
            def get(self, name):
                response = client.get_object(Bucket=c['bucket'], Key=prefix + name)
                with response['Body'] as stream:
                    data = stream.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError('Backup exceeds transfer limit')
                return data
            def names(self):
                return [v['Key'][len(prefix):] for page in client.get_paginator('list_objects_v2').paginate(Bucket=c['bucket'], Prefix=prefix) for v in page.get('Contents', []) if NAME.fullmatch(v['Key'][len(prefix):])]
            def delete(self, name):
                client.delete_object(Bucket=c['bucket'], Key=prefix + name)
        try:
            yield Store()
        finally:
            client.close()
    elif c['kind'] == 'sftp':
        import paramiko
        class PinnedHost(paramiko.MissingHostKeyPolicy):
            def missing_host_key(self, client, hostname, key):
                actual = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
                if actual != c['fingerprint']:
                    raise ValueError('SSH host key mismatch')
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(PinnedHost())
        try:
            ssh.connect(c['host'], port=c['port'], username=c['username'], password=c['password'],
                        look_for_keys=False, allow_agent=False, timeout=10, auth_timeout=15, banner_timeout=15)
            with ssh.open_sftp() as sftp:
                sftp.get_channel().settimeout(30)
                path = ''
                for part in prefix.strip('/').split('/'):
                    path += part + '/'
                    try:
                        sftp.stat(path)
                    except FileNotFoundError:
                        sftp.mkdir(path, mode=0o700)
                class Store:
                    def put(self, name, data):
                        with sftp.open(prefix + name, 'wb') as f:
                            f.write(data)
                        sftp.chmod(prefix + name, 0o600)
                    def get(self, name):
                        with sftp.open(prefix + name, 'rb') as f:
                            data = f.read(MAX_BYTES + 1)
                        if len(data) > MAX_BYTES:
                            raise ValueError('Backup exceeds transfer limit')
                        return data
                    def names(self):
                        return [n for n in sftp.listdir(prefix) if NAME.fullmatch(n)]
                    def delete(self, name):
                        sftp.remove(prefix + name)
                yield Store()
        finally:
            ssh.close()
    else:
        ftp = FTP_TLS(context=ssl.create_default_context(), timeout=30)
        try:
            ftp.connect(c['host'], c['port'])
            ftp.login(c['username'], c['password'])
            ftp.prot_p()
            for part in prefix.strip('/').split('/'):
                try:
                    ftp.cwd(part)
                except Exception:
                    ftp.mkd(part)
                    ftp.cwd(part)
            class Store:
                def put(self, name, data):
                    ftp.storbinary('STOR ' + name, io.BytesIO(data))
                def get(self, name):
                    target = LimitedBuffer()
                    ftp.retrbinary('RETR ' + name, target.write)
                    return target.getvalue()
                def names(self):
                    return [n for n in ftp.nlst() if NAME.fullmatch(n)]
                def delete(self, name):
                    ftp.delete(name)
            yield Store()
        finally:
            ftp.close()


def transfer(c, namespace, name, data):
    with remote_store(c, namespace) as store:
        store.put(name, data)
        if hashlib.sha256(store.get(name)).digest() != hashlib.sha256(data).digest():
            raise ValueError('Remote verification failed')
        # Never prune until the newly uploaded object was read back and verified.
        for old in sorted(store.names(), reverse=True)[c['retention']:]:
            store.delete(old)


def probe(c, namespace):
    name = 'probe-' + uuid.uuid4().hex + '.txt'
    payload = b'Sekaro remote backup connection test\n'
    with remote_store(c, namespace) as store:
        try:
            store.put(name, payload)
            if store.get(name) != payload:
                raise ValueError('Remote verification failed')
        finally:
            store.delete(name)


async def deliver_remote(data: bytes, local_path: str | None = None):
    async with AsyncSessionLocal() as db:
        target = await db.get(RemoteBackupTarget, 1)
        if target is None:
            return {'remote_status': 'disabled'}
        c, namespace = json.loads(target.config), target.namespace
        if not c.get('enabled'):
            return {'remote_status': 'disabled'}
        if os.getenv('SEKARO_DEMO_MODE') == '1':
            return {'remote_status': 'blocked', 'remote_error': 'External transfers are disabled in demo'}
        name = 'sekaro-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '-' + uuid.uuid4().hex[:12] + '.qbk'
        entry = BackupTransfer(created_at=datetime.now(timezone.utc).isoformat(), filename=name, status='pending', detail='', checksum=hashlib.sha256(data).hexdigest())
        db.add(entry)
        await db.commit()
        try:
            if not read_backup_metadata(data)[1]:
                raise ValueError('Remote backup requires encrypted QBK')
            if len(data) > MAX_BYTES or not local_disk_backups_enabled():
                raise ValueError('Remote backup requires local recovery storage; limit 512 MiB')
            # Dedicated spool is not subject to ordinary local rotation. Failures remain recoverable.
            spool = resolve_backup_directory('backups/remote-pending')
            spool.mkdir(parents=True, exist_ok=True, mode=0o700)
            path = spool / name
            with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            await asyncio.to_thread(transfer, c, namespace, name, data)
            entry.status = 'verified'
            path.unlink()  # Only verified transfers leave the pending spool.
        except Exception:
            entry.status = 'failed'
            entry.detail = 'Transfer failed. Check destination, credentials, encryption and local disk; pending files are retained.'
        await db.commit()
        return {'remote_status': entry.status, 'remote_error': entry.detail or None}
