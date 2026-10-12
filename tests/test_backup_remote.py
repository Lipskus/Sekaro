import json
from contextlib import contextmanager
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from app import backup_remote as remote
from app.backup_package import pack_backup, BackupPackageError
from app.backup_delivery import wrap_pg_dump_for_backup_config


def config(**kw):
    return {'kind':'s3','enabled':True,'bucket':'sekaro-test','access_key':'access','secret_key':'secret','prefix':'backups','retention':2, **kw}


@pytest.mark.parametrize('change', [dict(kind='ftp'),dict(prefix='../etc'),dict(endpoint='http://example.com'),dict(endpoint='https://user:secret@example.com'),dict(retention=0),dict(bucket='bad/bucket'),dict(kind='sftp',host='host',username='u',password='p',fingerprint='unverified'),dict(prefix='a//b')])
def test_invalid_remote_settings(change):
    with pytest.raises(ValueError): remote.validate_config(config(**change))


def test_encryption_never_silently_falls_back():
    with pytest.raises(BackupPackageError):
        wrap_pg_dump_for_backup_config({},b'PGDMP',{'encrypt_backups':True})


def test_retention_only_after_round_trip(monkeypatch):
    items={f'sekaro-2026010{i}T000000000000Z-abcdef123456.qbk':b'old' for i in range(1,4)}
    deleted=[]
    class Store:
        def put(self,n,d): items[n]=d
        def get(self,n): return items[n]
        def names(self): return list(items)
        def delete(self,n): deleted.append(n); del items[n]
    @contextmanager
    def store(*_): yield Store()
    monkeypatch.setattr(remote,'remote_store',store)
    name='sekaro-20260104T000000000000Z-abcdef123456.qbk'
    remote.transfer(config(),'namespace',name,b'new')
    assert len(items)==2 and name in items and len(deleted)==2
    deleted.clear()
    monkeypatch.setattr(Store,'get',lambda *_:b'corrupt')
    with pytest.raises(ValueError): remote.transfer(config(),'namespace',name,b'new')
    assert deleted==[]


@pytest.mark.asyncio
async def test_failed_transfer_retains_encrypted_local_and_records_history(engine,tmp_path,monkeypatch):
    session=async_sessionmaker(engine,expire_on_commit=False)
    monkeypatch.setattr(remote,'AsyncSessionLocal',session)
    monkeypatch.setattr(remote,'local_disk_backups_enabled',lambda:True)
    monkeypatch.setattr(remote,'resolve_backup_directory',lambda _:tmp_path)
    monkeypatch.delenv('SEKARO_DEMO_MODE',raising=False)
    def fail(*_): raise RuntimeError('SECRET must not be logged')
    monkeypatch.setattr(remote,'transfer',fail)
    async with session() as db:
        db.add(remote.RemoteBackupTarget(id=1,revision=1,namespace='test',config=json.dumps(config())))
        await db.commit()
    payload=pack_backup({},b'PGDMP-test',encrypt=True,password='test-password')
    result=await remote.deliver_remote(payload)
    assert result['remote_status']=='failed' and 'SECRET' not in result['remote_error']
    files=list(tmp_path.glob('*.qbk'))
    assert len(files)==1 and files[0].read_bytes()==payload
    assert files[0].stat().st_mode & 0o777 == 0o600
    async with session() as db:
        row=await db.scalar(select(remote.BackupTransfer))
        assert row.status=='failed' and 'SECRET' not in row.detail


@pytest.mark.asyncio
async def test_demo_never_connects(engine,monkeypatch):
    session=async_sessionmaker(engine,expire_on_commit=False)
    monkeypatch.setattr(remote,'AsyncSessionLocal',session)
    monkeypatch.setenv('SEKARO_DEMO_MODE','1')
    async with session() as db:
        db.add(remote.RemoteBackupTarget(id=1,revision=1,namespace='test',config=json.dumps(config())))
        await db.commit()
    monkeypatch.setattr(remote,'transfer',lambda *_:pytest.fail('Demo opened remote connection'))
    assert (await remote.deliver_remote(b'anything'))['remote_status']=='blocked'


def test_public_settings_never_return_secrets():
    from app.routers.backup_remote import public
    result=public(remote.RemoteBackupTarget(revision=1,namespace='test',config=json.dumps(config())))
    assert result['secrets']['secret_key'] is True
    assert 'secret_key' not in result['config'] and 'access_key' not in result['config']


def test_download_name_rejects_traversal():
    for name in ['../secret','a\r\nDELE file','other.qbk','/etc/passwd']:
        assert not remote.NAME.fullmatch(name)
