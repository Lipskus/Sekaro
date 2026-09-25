#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
demo_dir=".sekaro-demo"
demo_command="${1:-up}"
case "$demo_command" in up|replace-production|status|logs|login|stop|reset|remove) ;; *)
  echo 'Usage: bash scripts/sekaro-demo.sh {up|replace-production|status|logs|login|stop|reset|remove}' >&2; exit 2;; esac
umask 077
if [[ ! -f "$demo_dir/env" ]]; then
  if [[ "$demo_command" != up && "$demo_command" != replace-production ]]; then
    echo 'Demo is not initialized. Run: bash scripts/sekaro-demo.sh replace-production' >&2; exit 1
  fi
  mkdir -p "$demo_dir"
  python3 - "$demo_dir/env" <<'PY'
import os, secrets, sys
keys = ['DEMO_DB_PASSWORD', 'DEMO_ADMIN_PASSWORD', 'DEMO_SECRET_KEY', 'DEMO_ENCRYPTION_KEY']
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    for key in keys:
        f.write(f'{key}={secrets.token_urlsafe(32)}\n')
PY
fi
compose=(docker compose --env-file "$demo_dir/env" -p sekaro-demo -f docker-compose.demo.yml)
production=(docker compose -p sekaro -f docker-compose.sekaro.yml)
require_single_instance() {
  if [[ -n "$(docker ps -q --filter label=com.docker.compose.project=sekaro)" ]]; then
    echo 'Sekaro production is running. To replace it and DELETE its database, run: bash scripts/sekaro-demo.sh replace-production' >&2
    exit 1
  fi
}
preflight() {
  docker image inspect sekaro:local >/dev/null
  docker image inspect postgres:15-alpine >/dev/null
  "${compose[@]}" config --quiet
  docker image inspect nginx:1.28-alpine >/dev/null 2>&1 || docker pull nginx:1.28-alpine
}
start_demo() {
  "${compose[@]}" up -d --wait --wait-timeout 180
  show_login
}
show_login() {
  python3 - "$demo_dir/env" <<'PY'
import sys
values = dict(line.rstrip('\n').split('=', 1) for line in open(sys.argv[1]) if '=' in line)
print('DEMO: http://127.0.0.1:5050\nLogin: demo\nHasło: ' + values['DEMO_ADMIN_PASSWORD'])
print('Jeśli hasło zmieniono w interfejsie, użyj nowego hasła; to jest hasło początkowe.')
PY
}
case "$demo_command" in
  up)
    require_single_instance
    preflight
    start_demo;;
  replace-production)
    # Explicit replacement of the empty production installation, including its DB.
    # Validate both configurations and existing images before removing anything.
    preflight
    "${production[@]}" config --quiet
    echo 'Replacing Sekaro production: removing its containers and database volume.'
    "${production[@]}" down --volumes
    start_demo;;
  status) "${compose[@]}" ps;;
  logs) "${compose[@]}" logs --tail=100 demo-app demo-gateway;;
  login) show_login;;
  stop) "${compose[@]}" stop;;
  reset)
    require_single_instance
    preflight
    # This compose contains only demo services and the project-owned demo volume.
    "${compose[@]}" down -v
    start_demo;;
  remove) "${compose[@]}" down -v;;
esac
