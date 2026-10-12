#!/usr/bin/env bash
# Real Docker networking test; a tiny HTTP fixture replaces only the app process.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
network_test_dir=$(mktemp -d)
export DEMO_DB_PASSWORD=ci-network-only
export DEMO_ADMIN_PASSWORD=ci-network-only-password-long-enough
export DEMO_SECRET_KEY=ci-network-only-secret
export DEMO_ENCRYPTION_KEY=ci-network-only-encryption
cat > "$network_test_dir/app.conf" <<'NGINX'
events {}
http { server { listen 8000; location / { default_type application/json; return 200 '{"network_test":true}'; } } }
NGINX
cat > "$network_test_dir/override.yml" <<YAML
services:
  demo-app:
    image: nginx:1.28-alpine
    command: [nginx, -g, 'daemon off;']
    volumes:
      - $network_test_dir/app.conf:/etc/nginx/nginx.conf:ro
    healthcheck:
      test: [CMD, wget, -q, -O, /dev/null, 'http://127.0.0.1:8000/api/demo/status']
YAML
compose=(docker compose -p sekaro-demo-network-ci -f docker-compose.demo.yml -f "$network_test_dir/override.yml")
cleanup() {
  result=$?
  if (( result != 0 )); then "${compose[@]}" logs --tail=40 || true; fi
  "${compose[@]}" down --volumes || true
  rm -rf "$network_test_dir"
  exit "$result"
}
trap cleanup EXIT
docker pull nginx:1.28-alpine
# Start with the previous internal network and persist a database marker.
cat > "$network_test_dir/legacy.yml" <<'YAML'
networks:
  demo-only:
    internal: true
YAML
"${compose[@]}" -f "$network_test_dir/legacy.yml" up -d --wait --wait-timeout 120
"${compose[@]}" exec -T demo-db psql -U sekaro_demo -d sekaro_demo -c 'CREATE TABLE migration_probe AS SELECT 42 AS marker;'
# Same non-destructive migration used by sekaro-demo.sh.
"${compose[@]}" down --remove-orphans
"${compose[@]}" up -d --wait --wait-timeout 120
test "$("${compose[@]}" exec -T demo-db psql -U sekaro_demo -d sekaro_demo -Atc 'SELECT marker FROM migration_probe')" = 42
check_host() {
  curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 2 \
    http://127.0.0.1:5050/api/demo/status | python3 -c 'import json,sys; assert json.load(sys.stdin)["network_test"] is True'
}
check_host
# Recreate the app to verify that host publication remains operational.
"${compose[@]}" up -d --no-deps --force-recreate --wait demo-app
check_host
docker inspect "$("${compose[@]}" ps -q demo-app)" | python3 -c '
import json,sys
container=json.load(sys.stdin)[0]
assert len(container["NetworkSettings"]["Networks"]) == 1
assert next(iter(container["NetworkSettings"]["Networks"])).endswith("_demo-only")
assert container["NetworkSettings"]["Ports"]["8000/tcp"] == [{"HostIp":"127.0.0.1", "HostPort":"5050"}]
'
echo 'Demo network migration, data preservation and direct host port: OK'
