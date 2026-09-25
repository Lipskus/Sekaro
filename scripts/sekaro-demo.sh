#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
demo_dir=".sekaro-demo"
demo_command="${1:-up}"
case "$demo_command" in up|status|logs|login|stop|reset|remove) ;; *)
  echo 'Usage: bash scripts/sekaro-demo.sh {up|status|logs|login|stop|reset|remove}' >&2; exit 2;; esac
umask 077
if [[ ! -f "$demo_dir/env" ]]; then
  if [[ "$demo_command" != up ]]; then echo 'Demo is not initialized. Run: bash scripts/sekaro-demo.sh up' >&2; exit 1; fi
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
show_login() {
  python3 - "$demo_dir/env" <<'PY'
import sys
values = dict(line.rstrip('\n').split('=', 1) for line in open(sys.argv[1]) if '=' in line)
print('DEMO: http://127.0.0.1:5051\nLogin: demo\nHasło: ' + values['DEMO_ADMIN_PASSWORD'])
print('Jeśli hasło zmieniono w interfejsie, użyj nowego hasła; to jest hasło początkowe.')
PY
}
case "$demo_command" in
  up)
    docker image inspect sekaro:local >/dev/null
    "${compose[@]}" up -d --wait --wait-timeout 180
    show_login;;
  status) "${compose[@]}" ps;;
  logs) "${compose[@]}" logs --tail=100 demo-app;;
  login) show_login;;
  stop) "${compose[@]}" stop;;
  reset)
    # This compose contains only demo services and the project-owned demo volume.
    "${compose[@]}" down -v
    "${compose[@]}" up -d --wait --wait-timeout 180
    show_login;;
  remove) "${compose[@]}" down -v;;
esac
