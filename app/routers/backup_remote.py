"""Administrator-only remote backup configuration and recovery downloads."""
import asyncio
import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import require_admin
from app.database import get_db
from app.security import encryption_enabled
from app.app_settings import get_backup_config
from app.backup_remote import (RemoteBackupTarget, BackupTransfer, SECRET_FIELDS, NAME,
                               validate_config, probe, remote_store)

router = APIRouter(prefix='/api/settings/backup/remote', tags=['backup'], dependencies=[Depends(require_admin)])

class TargetBody(BaseModel):
    revision: int = Field(0, ge=0)
    config: dict

class FileBody(BaseModel):
    name: str = Field(..., max_length=120)


def public(target):
    if target is None:
        return {'revision': 0, 'config': {'enabled': False, 'kind': 's3', 'prefix': 'sekaro', 'retention': 14}, 'secrets': {}, 'namespace': None}
    cfg = json.loads(target.config)
    return {'revision': target.revision, 'config': {k: v for k, v in cfg.items() if k not in SECRET_FIELDS},
            'secrets': {k: bool(cfg.get(k)) for k in SECRET_FIELDS}, 'namespace': target.namespace}


def external_allowed():
    if os.getenv('SEKARO_DEMO_MODE') == '1':
        raise HTTPException(403, 'External backup connections are disabled in demo')


@router.get('')
async def config(db: AsyncSession = Depends(get_db)):
    out = public(await db.get(RemoteBackupTarget, 1))
    out['demo'] = os.getenv('SEKARO_DEMO_MODE') == '1'
    out['encryption_available'] = encryption_enabled()
    return out


@router.put('')
async def save(body: TargetBody, db: AsyncSession = Depends(get_db)):
    if not encryption_enabled():
        raise HTTPException(400, 'Configure SEKARO_ENCRYPTION_KEY before storing remote credentials')
    target = await db.scalar(select(RemoteBackupTarget).where(RemoteBackupTarget.id == 1).with_for_update())
    if body.revision != (target.revision if target else 0):
        raise HTTPException(409, 'Configuration changed. Reload before saving.')
    cfg = dict(body.config)
    previous = json.loads(target.config) if target else {}
    for key in SECRET_FIELDS:
        if not cfg.get(key) and cfg.get('kind') == previous.get('kind'):
            cfg[key] = previous.get(key, '')
    try:
        cfg = validate_config(cfg)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e)) from e
    if cfg.get('enabled'):
        from app.backup_pg import local_disk_backups_enabled
        if not local_disk_backups_enabled():
            raise HTTPException(400, 'Remote backups require local disk recovery storage')
        backup = await get_backup_config(db)
        if not backup['encrypt_backups'] or len(backup['backup_encryption_password']) < 8:
            raise HTTPException(400, 'Enable backup encryption and save a password first')
    if target is None:
        target = RemoteBackupTarget(id=1, revision=1, namespace=uuid.uuid4().hex, config=json.dumps(cfg))
        db.add(target)
    else:
        target.config = json.dumps(cfg)
        target.revision += 1
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Configuration changed. Reload before saving.")
    return await config(db)


async def selected(db):
    external_allowed()
    target = await db.get(RemoteBackupTarget, 1)
    if target is None:
        raise HTTPException(400, 'Save a remote destination first')
    return json.loads(target.config), target.namespace


@router.post('/test')
async def test(db: AsyncSession = Depends(get_db)):
    cfg, namespace = await selected(db)
    try:
        await asyncio.to_thread(probe, cfg, namespace)
    except Exception:
        raise HTTPException(502, 'Connection test failed. Check credentials, permissions, TLS or SSH host key.')
    return {'ok': True}


@router.get('/files')
async def files(db: AsyncSession = Depends(get_db)):
    cfg, namespace = await selected(db)
    def listing():
        with remote_store(cfg, namespace) as store:
            return sorted(store.names(), reverse=True)
    try:
        return {'files': await asyncio.to_thread(listing)}
    except Exception:
        raise HTTPException(502, 'Cannot list remote backups')


@router.post('/download')
async def download(body: FileBody, db: AsyncSession = Depends(get_db)):
    cfg, namespace = await selected(db)
    if not NAME.fullmatch(body.name):
        raise HTTPException(400, 'Invalid backup filename')
    def fetch():
        with remote_store(cfg, namespace) as store:
            return store.get(body.name)
    try:
        data = await asyncio.to_thread(fetch)
    except Exception:
        raise HTTPException(502, 'Cannot download remote backup')
    return Response(data, media_type='application/octet-stream', headers={'Content-Disposition': f'attachment; filename="{body.name}"'})


@router.get('/history')
async def history(db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(BackupTransfer).order_by(BackupTransfer.id.desc()).limit(100))).all()
    return {'items': [{'id': r.id, 'created_at': r.created_at, 'filename': r.filename,
                       'status': r.status, 'detail': r.detail, 'checksum': r.checksum} for r in rows]}
