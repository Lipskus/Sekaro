import importlib.util
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location('sekaro_installer',Path(__file__).parents[1]/'scripts/sekaro-install.py')
installer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def test_demo_pg17_override_is_preserved(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path)
    (tmp_path/'.sekaro-demo').mkdir()
    (tmp_path/'.sekaro-demo/pg17.compose.json').write_text('{}')
    cmd=installer.compose(True)
    assert cmd[-2:]==['-f','.sekaro-demo/pg17.compose.json']
    assert 'docker-compose.sekaro.yml' not in cmd


def test_fresh_install_secrets_and_pg17_are_idempotent(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path)
    monkeypatch.setattr(installer,'output',lambda _: '')
    installer.create_install()
    env=(tmp_path/'.env').read_bytes()
    assert (tmp_path/'.env').stat().st_mode&0o777==0o600
    assert 'postgres:17-alpine' in (tmp_path/'.sekaro-install/compose.json').read_text()
    with pytest.raises(RuntimeError): installer.create_install()
    assert (tmp_path/'.env').read_bytes()==env


def test_existing_volume_without_env_refuses_install(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path)
    monkeypatch.setattr(installer,'output',lambda _: 'sekaro_pgdata')
    with pytest.raises(RuntimeError): installer.create_install()
    assert not (tmp_path/'.env').exists()


def test_failed_preupdate_dump_is_not_retained_as_valid(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path)
    def fail(*_,**kw):
        kw['stdout'].write(b'broken')
        raise RuntimeError('dump failed')
    monkeypatch.setattr(installer,'run',fail)
    with pytest.raises(RuntimeError): installer.backup(['docker','compose'],False)
    assert not list((tmp_path/'backups/before-update').iterdir())


def test_successful_preupdate_dump_is_private(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path)
    monkeypatch.setattr(installer,'run',lambda *_,**kw:kw['stdout'].write(b'PGDMPvalid'))
    installer.backup(['docker','compose'],False)
    saved=list((tmp_path/'backups/before-update').glob('*.dump'))
    assert len(saved)==1 and saved[0].stat().st_mode&0o777==0o600


def update_harness(tmp_path, monkeypatch, *, skip=False, backup_fails=False):
    monkeypatch.setattr(installer, 'ROOT', tmp_path)
    (tmp_path / '.sekaro-demo').mkdir()
    (tmp_path / '.sekaro-demo/env').write_text('')
    monkeypatch.setattr(installer.sys, 'argv', ['installer', 'update'] + (['--skip-previous-image-backup'] if skip else []))
    monkeypatch.setattr(installer.os, 'umask', lambda _: None)
    monkeypatch.setattr(installer, 'check', lambda: 'approved-revision')
    calls = []
    def backup(cmd, demo):
        calls.append('database-backup')
        if backup_fails:
            raise RuntimeError('database unavailable')
    def output(cmd):
        if cmd[-3:] == ['ps', '-q', 'demo-app']:
            return 'running-container'
        if cmd[-1] == '{{.Image}}':
            return 'sha256:missing'
        if 'org.opencontainers.image.revision' in cmd[-1]:
            return 'approved-revision'
        raise AssertionError(cmd)
    def run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[:2] == ['docker', 'tag']:
            raise installer.subprocess.CalledProcessError(1, cmd)
    monkeypatch.setattr(installer, 'backup', backup)
    monkeypatch.setattr(installer, 'output', output)
    monkeypatch.setattr(installer, 'run', run)
    return calls


def test_missing_previous_image_stops_before_build(tmp_path, monkeypatch):
    calls = update_harness(tmp_path, monkeypatch)
    with pytest.raises(RuntimeError, match='skip-previous-image-backup'):
        installer.main()
    assert calls == ['database-backup', ['docker', 'tag', 'sha256:missing', 'sekaro:previous']]


def test_explicit_image_skip_keeps_database_backup_and_revision_check(tmp_path, monkeypatch, capsys):
    calls = update_harness(tmp_path, monkeypatch, skip=True)
    installer.main()
    assert calls[0] == 'database-backup'
    assert calls[1][:2] == ['docker', 'build']
    assert calls[2] == ['bash', 'scripts/sekaro-demo.sh', 'up']
    assert len(calls) == 3
    assert 'may be stale' in capsys.readouterr().out


def test_image_skip_cannot_bypass_failed_database_backup(tmp_path, monkeypatch):
    calls = update_harness(tmp_path, monkeypatch, skip=True, backup_fails=True)
    with pytest.raises(RuntimeError, match='database unavailable'):
        installer.main()
    assert calls == ['database-backup']


def test_image_skip_is_update_only(monkeypatch):
    monkeypatch.setattr(installer.sys, 'argv', ['installer', 'install', '--skip-previous-image-backup'])
    with pytest.raises(RuntimeError, match='only for update'):
        installer.main()
