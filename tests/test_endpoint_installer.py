import importlib.util
import json
from pathlib import Path
import pytest
import yaml

spec=importlib.util.spec_from_file_location('endpoint_install',Path(__file__).parents[1]/'scripts/endpoint_install.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)


def test_container_boundary():
    config=yaml.safe_load((Path(__file__).parents[1]/'docker-compose.endpoint.yml').read_text())
    service=config['services']['endpoint']
    assert service['read_only'] and service['cap_drop']==['ALL']
    assert config['networks']['endpoint-only']['internal']
    assert 'docker.sock' not in str(service) and 'DATABASE_URL' not in str(service)
    assert service['networks']==['endpoint-only']
    assert len(service['ports'])==2
    assert '127.0.0.1' in service['ports'][0] and '127.0.0.1' in service['ports'][1]


def test_installer_refuses_overwrite(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path);monkeypatch.setattr(installer,'STATE',tmp_path/'state')
    installer.write_private(tmp_path/'state/env','existing')
    monkeypatch.setattr(installer,'run',lambda *a,**k:pytest.fail('No Docker changes allowed'))
    with pytest.raises(RuntimeError):installer.main(['endpoint-install'])
    assert (tmp_path/'state/env').read_text()=='existing'


def test_key_rotation_retains_old_until_explicit_revocation(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path);monkeypatch.setattr(installer,'STATE',tmp_path/'state')
    installer.write_private(tmp_path/'state/env','')
    keyfile=tmp_path/'state/server.keys'
    installer.write_private(keyfile,'old-key'+('x'*40)+'\n')
    old=keyfile.read_text().strip();inode=keyfile.stat().st_ino
    installer.main(['endpoint-rotate'])
    keys=keyfile.read_text().splitlines()
    assert keys[1]==old and keys[0]!=old and keyfile.stat().st_ino==inode
    assert (tmp_path/'state/client.key').stat().st_mode&0o777==0o600
    installer.main(['endpoint-revoke-old'])
    assert keyfile.read_text().splitlines()==keys[:1]


def test_connect_never_drops_historical_endpoint(tmp_path,monkeypatch):
    monkeypatch.setattr(installer,'ROOT',tmp_path)
    target=tmp_path/'.sekaro-install/endpoint-client/client.json'
    installer.write_private(target,json.dumps({'mode':'tracking','endpoints':[{'id':'old'}]}))
    requested=tmp_path/'request.json';requested.write_text(json.dumps({'mode':'private','endpoints':[]}))
    with pytest.raises(RuntimeError,match='retired'):
        installer.main(['endpoint-connect','--config',str(requested)])
    assert json.loads(target.read_text())['endpoints']==[{'id':'old'}]
