#!/usr/bin/env python3
"""Idempotent Sekaro operator CLI. Requires Docker Compose; never upgrades PG major versions."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)


def output(args):
    return run(args, capture_output=True, text=True).stdout.strip()


def compose(demo):
    if demo:
        cmd = ['docker', 'compose', '--env-file', '.sekaro-demo/env', '-p', 'sekaro-demo', '-f', 'docker-compose.demo.yml']
        if (ROOT / '.sekaro-demo/pg17.compose.json').exists():
            cmd += ['-f', '.sekaro-demo/pg17.compose.json']
    else:
        cmd = ['docker', 'compose', '--env-file', '.env', '-f', 'docker-compose.sekaro.yml']
        if (ROOT / '.sekaro-install/compose.json').exists():
            cmd += ['-f', '.sekaro-install/compose.json']
    if not demo and (ROOT / '.sekaro-install/antivirus').exists():
        cmd += ['-f', 'docker-compose.antivirus.yml']
    return cmd


def check():
    run(['docker', 'info'], stdout=subprocess.DEVNULL)
    run(['docker', 'compose', 'version'])
    revision = output(['git', 'rev-parse', 'HEAD'])
    if output(['git', 'status', '--porcelain', '--untracked-files=no']):
        raise RuntimeError('Tracked files are modified. Commit or review changes before building a labeled release.')
    print('Git revision:', revision)
    return revision


def create_install():
    if (ROOT / '.sekaro-demo/env').exists() or (ROOT / '.env').exists():
        raise RuntimeError('Existing configuration found. Use update; install never overwrites credentials.')
    volumes = output(['docker', 'volume', 'ls', '--format', '{{.Name}}']).splitlines()
    if any(v in {'sekaro_pgdata', 'sekaro-demo_demo_pgdata'} for v in volumes):
        raise RuntimeError('Existing database volume found without matching configuration. Restore configuration first.')
    running = output(['docker', 'ps', '--format', '{{.Names}}']).splitlines()
    if any('sekaro' in name or 'quickly' in name for name in running):
        raise RuntimeError('Another Sekaro/Quickly instance is running. Review it before installing.')
    env = '\n'.join(['POSTGRES_PASSWORD=' + secrets.token_urlsafe(36),
        'QUICKLY_SECRET_KEY=' + secrets.token_urlsafe(48),
        'SEKARO_ENCRYPTION_KEY=' + secrets.token_urlsafe(48), 'SEKARO_PORT=5050', 'QUICKLY_MODE=production', ''])
    with os.fdopen(os.open(ROOT / '.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        f.write(env)
    state = ROOT / '.sekaro-install'
    state.mkdir(mode=0o700, exist_ok=True)
    # Only fresh installations get PG17. Updates retain the existing Compose/override version.
    (state / 'compose.json').write_text(json.dumps({'services': {'db': {'image': 'postgres:17-alpine'}}}) + '\n')
    (ROOT / 'backups').mkdir(mode=0o700, exist_ok=True)


def backup(cmd, demo):
    destination = ROOT / 'backups' / 'before-update'
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.dump'
    pending = destination / (name + '.partial')
    service = 'demo-db' if demo else 'db'
    # pg_dump runs inside its matching server image, using the existing container environment.
    try:
        with os.fdopen(os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as f:
            run(cmd + ['exec', '-T', service, 'sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], stdout=f)
            f.flush()
            os.fsync(f.fileno())
        with pending.open('rb') as f:
            if f.read(5) != b'PGDMP':
                raise RuntimeError('Pre-update backup validation failed')
        final = destination / name
        pending.rename(final)
        print('Local pre-update database snapshot:', final)
        print('This local dump is not encrypted. Protect backups/ and keep your .env separately.')
    except Exception:
        pending.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'install', 'update', 'status', 'backup'])
    parser.add_argument('--antivirus', action='store_true', help='Enable optional ClamAV restore scanning (production install/update only)')
    args = parser.parse_args()
    os.umask(0o077)
    demo = (ROOT / '.sekaro-demo/env').exists()
    if args.antivirus and (demo or args.action not in {'install', 'update'}):
        raise RuntimeError('--antivirus is supported only for production install/update')
    cmd = compose(demo)
    if args.action == 'status':
        run(cmd + ['ps'])
        return
    if args.action == 'backup':
        backup(cmd, demo)
        return
    revision = check()
    if args.action == 'check':
        return
    if args.action == 'install':
        create_install()
        demo = False
        cmd = compose(False)
    elif not (ROOT / ('.sekaro-demo/env' if demo else '.env')).exists():
        raise RuntimeError('Configuration missing. Use install for a fresh installation.')
    if args.antivirus:
        (ROOT / '.sekaro-install').mkdir(mode=0o700, exist_ok=True)
        (ROOT / '.sekaro-install/antivirus').touch(mode=0o600, exist_ok=True)
        cmd = compose(False)
    if args.action == 'update':
        backup(cmd, demo)
    # Capture the running image, not a potentially stale sekaro:local build.
    service = 'demo-app' if demo else 'app'
    container = output(cmd + ['ps', '-q', service])
    if container:
        old_image = output(['docker', 'inspect', container, '--format', '{{.Image}}'])
        run(['docker', 'tag', old_image, 'sekaro:previous'])
    run(['docker', 'build', '--label', 'org.opencontainers.image.revision=' + revision, '-t', 'sekaro:local', '.'])
    if demo:
        run(['bash', 'scripts/sekaro-demo.sh', 'up'])
    else:
        run(cmd + ['up', '-d', '--wait', '--wait-timeout', '180'])
    container = output(cmd + ['ps', '-q', service])
    actual = output(['docker', 'inspect', container, '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}'])
    if actual != revision:
        raise RuntimeError('Running image revision does not match the requested release')
    print('Sekaro ready at http://127.0.0.1:5050 — revision', actual)
    if args.action == 'install':
        print('Open through a trusted local/HTTPS connection and complete first administrator setup.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as exc:
        print('STOP:', exc, file=sys.stderr)
        sys.exit(1)
