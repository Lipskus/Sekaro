import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
from app import backup_pg
from app import backup_restore_staging as staging
from app.public_links import get_unsubscribe_base
from public_unsubscribe.server import app as public_app


def test_restore_failure_rolls_back_and_is_not_success(monkeypatch,tmp_path):
    run=Mock(return_value=SimpleNamespace(returncode=1,stderr=b'SECRET password',stdout=b''))
    monkeypatch.setattr(backup_pg.subprocess,'run',run)
    with pytest.raises(backup_pg.BackupToolError) as exc:
        backup_pg.pg_restore_replace('postgresql+asyncpg://user:SECRET@db:5432/sekaro',tmp_path/'backup.dump')
    assert 'SECRET' not in str(exc.value)
    args=run.call_args.args[0]
    assert '--single-transaction' in args and '--exit-on-error' in args
    assert not any('SECRET' in arg for arg in args)
    assert run.call_args.kwargs['env']['PGPASSWORD']=='SECRET'


def test_backup_keeps_password_out_of_argv_and_rejects_tool_failure(monkeypatch):
    run=Mock(return_value=SimpleNamespace(returncode=0,stdout=b'PGDMP',stderr=b''))
    monkeypatch.setattr(backup_pg.subprocess,'run',run)
    assert backup_pg.pg_dump_custom('postgresql://u:p%40ss@db/test')==b'PGDMP'
    assert run.call_args.kwargs['env']['PGPASSWORD']=='p@ss'
    assert not any('p@ss' in arg for arg in run.call_args.args[0])
    assert '--no-acl' in run.call_args.args[0]


def test_restore_staging_rejects_path_traversal_and_metadata_escape(monkeypatch,tmp_path):
    monkeypatch.setenv('QUICKLY_RESTORE_STAGING_DIR',str(tmp_path))
    assert staging.consume_staged_dump('../outside',expected_kind='admin') is None
    token,_=staging.stage_decrypted_dump(b'PGDMP',kind='admin')
    import json
    outside=tmp_path/'outside';outside.write_bytes(b'keep')
    meta=staging._meta_path(token);data=json.loads(meta.read_text());data['path']=str(outside);meta.write_text(json.dumps(data))
    assert staging.consume_staged_dump(token,expected_kind='admin') is None
    assert outside.read_bytes()==b'keep'


def test_staging_is_single_use_and_kind_bound(monkeypatch,tmp_path):
    monkeypatch.setenv('QUICKLY_RESTORE_STAGING_DIR',str(tmp_path))
    token,_=staging.stage_decrypted_dump(b'PGDMP',kind='admin')
    assert staging.consume_staged_dump(token,expected_kind='setup') is None
    path=staging.consume_staged_dump(token,expected_kind='admin')
    assert path.read_bytes()==b'PGDMP'
    assert staging.consume_staged_dump(token,expected_kind='admin') is None


def test_public_origin_independent_of_private_tracking(monkeypatch):
    monkeypatch.setenv('SEKARO_UNSUBSCRIBE_BASE_URL','https://unsubscribe.example.com')
    assert get_unsubscribe_base('https://private.example.com')=='https://unsubscribe.example.com'
    for origin in ['http://public.example.com','https://user:password@public.example.com','https://public.example.com/path','https://public.example.com?q=x']:
        monkeypatch.setenv('SEKARO_UNSUBSCRIBE_BASE_URL',origin)
        with pytest.raises(ValueError):get_unsubscribe_base('https://private.example.com')


class FakeConnection:
    def __init__(self,result=True,error=None): self.result=result;self.error=error;self.calls=[]
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    async def fetchval(self,sql,token):
        self.calls.append((sql,token))
        if self.error:raise self.error
        return self.result
    def acquire(self):return self


@pytest.mark.parametrize('path',['/','/api/auth/login','/api/leads','/docs','/openapi.json','/o/123','/c/test'])
def test_public_has_no_private_or_tracking_routes(path):
    client=TestClient(public_app)
    response=client.get(path)
    assert response.status_code==404
    assert response.headers['cache-control']=='no-store'


def test_public_unsubscribe_get_post_and_failure():
    connection=FakeConnection();public_app.state.pool=connection
    client=TestClient(public_app)
    for method in ('get','post'):
        response=getattr(client,method)('/u/'+'a'*43)
        assert response.status_code==200
    assert len(connection.calls)==2
    assert all(sql=='SELECT sekaro_public.unsubscribe($1)' for sql,_ in connection.calls)
    assert client.get('/u/invalid').status_code==404
    connection.result=False
    assert client.get('/u/'+'b'*43).status_code==404
    connection.error=TimeoutError()
    assert client.get('/u/'+'a'*43).status_code==503


@pytest.mark.asyncio
async def test_restore_requires_maintenance_before_touching_database(monkeypatch):
    from app.backup_restore_ops import restore_database_from_bytes
    from fastapi import BackgroundTasks
    monkeypatch.delenv('SEKARO_MAINTENANCE',raising=False)
    with pytest.raises(backup_pg.BackupToolError,match='MAINTENANCE'):
        await restore_database_from_bytes(b'ignored',BackgroundTasks())


def test_public_compose_excludes_panel_and_secrets():
    import yaml
    config=yaml.safe_load(Path('docker-compose.sekaro.yml').read_text())
    services=config['services'];public=services['unsubscribe']
    assert set(public['networks']).isdisjoint(services['app']['networks'])
    assert config['networks']['unsubscribe-db']['internal'] is True
    assert list(public['environment'])==['UNSUBSCRIBE_DATABASE_URL']
    assert not public.get('env_file')
    assert public['read_only'] and public['cap_drop']==['ALL']
    assert all(p.startswith('127.0.0.1:') for p in public['ports'])
    assert not services['db'].get('ports')


@pytest.mark.parametrize('fail_at',[None,'signatures','switch'])
def test_upgrade_keeps_old_data_and_rolls_back_failed_switch(monkeypatch,tmp_path,fail_at):
    import json
    spec=importlib.util.spec_from_file_location('pg_upgrade',Path('scripts/upgrade-demo-postgres.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    monkeypatch.setattr(module,'ROOT',tmp_path);monkeypatch.setattr(module,'STATE',tmp_path)
    monkeypatch.setattr(module,'OVERRIDE',tmp_path/'pg17.compose.json')
    monkeypatch.setattr(module,'COMPOSE',['docker','compose','-f','original.yml'])
    monkeypatch.setattr(module.os,'chdir',lambda _:None)
    monkeypatch.setattr(module.os,'umask',lambda _:None)
    calls=[]
    def fake_run(args,**kw):
        calls.append(args)
        if 'config' in args:return json.dumps({'services':{'demo-db':{'environment':{'POSTGRES_USER':'demo','POSTGRES_DB':'demo','POSTGRES_PASSWORD':'secret'}}}}).encode()
        if 'ps' in args:return b'original-container'
        if args[-1]=='SHOW server_version_num':return b'150014'
        if fail_at=='switch' and str(module.OVERRIDE) in args and args[-1]=='demo-app':raise RuntimeError('unhealthy')
        return b''
    monkeypatch.setattr(module,'run',fake_run)
    sample=iter([{'lead':{'rows':2,'hash_a':'1'}},{'lead':{'rows':2,'hash_a':'2' if fail_at=='signatures' else '1'}}])
    monkeypatch.setattr(module,'signatures',lambda *args:next(sample))
    def process(args,**kw):
        calls.append(args)
        if 'pg_dump' in args:kw['stdout'].write(b'PGDMP')
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(module.subprocess,'run',process)
    if fail_at:
        with pytest.raises(RuntimeError):module.upgrade()
        assert not module.OVERRIDE.exists()
    else:
        module.upgrade();assert module.OVERRIDE.exists()
    assert list(tmp_path.glob('*.dump'))[0].read_bytes()==b'PGDMP'
    assert not any('volume' in call and 'rm' in call for call in calls)
    assert all('secret' not in ' '.join(call) for call in calls)
    if fail_at=='switch':
        assert any(call[:5]==['docker','compose','-f','original.yml','up'] and call[-1]=='demo-db' for call in calls)


def test_public_unsubscribe_link_never_wrapped_in_private_tracking(monkeypatch):
    from app.tracking import inject_tracking_html
    monkeypatch.setenv('SEKARO_UNSUBSCRIBE_BASE_URL','https://unsubscribe.example.com')
    url='https://unsubscribe.example.com/u/'+'a'*43
    html,pairs=inject_tracking_html(f'<a href="{url}">Rezygnacja</a><p>{url}</p><a href="https://example.com">Other</a>',1,'https://private.example.com',track_opens=False)
    assert html.count(url)==2
    assert len(pairs)==1 and pairs[0][1]=='https://example.com'
