# Database and operations

Documentation for Sekaro 1.0.

## Supported upgrades

| Source | Target | Method | Upgrade verification |
|---|---|---|---|
| Existing PostgreSQL 15 demo, `docker-compose.demo.yml` | PostgreSQL 17, new volume | `python3 scripts/upgrade-demo-postgres.py` | Successful dump restore, matching row counts and data signatures for all `public` tables, healthy application container |
| Current application on PG15 | Same PG15 with the current application | Build and recreate the app container | Backend tests; staying on PG15 is supported |
| Production PG15 | PG17 | Controlled dump/restore during a maintenance window, following the same principle | Separate rehearsal using a copy of the operator's data; the demo script does not touch production |
| Other engines/major versions, in-place `pg_upgrade`, HA clusters | — | Outside the verified matrix | Do not use the demo script |

The application image explicitly includes the PostgreSQL 17 client (`python:3.12-slim-trixie`, `postgresql-client-17`). The database image is not automatically switched over an existing data directory. Never start a PG17 server against a PG15 data directory.

### Upgrading an existing demo

After checking out the exact release commit and building `sekaro:local`, run:

```bash
python3 scripts/upgrade-demo-postgres.py
```

The script pulls the target image, then stops **only demo-app**. It saves a dump with mode 0600 in `.sekaro-demo`, starts a temporary PG17 server without networking or published ports, restores the database in one transaction, and compares all tables. Each table signature includes its row count and two sums of MD5 halves calculated from complete JSONB rows. This is a consistency check, not a cryptographic backup signature. Only matching results allow the existing `demo-db` service to switch to the new volume and the application to restart. No second application or demo is created.

The following remain after the upgrade:

- `.sekaro-demo/pg17.compose.json`: permanent image and volume override. **Include it in every subsequent Compose invocation.**
- `.sekaro-demo/sekaro-pg17-check-*.dump`: backup taken before the upgrade.
- `.sekaro-demo/sekaro-pg17-check-*.json`: signature report.
- Original PG15 volume: left intact; the script never deletes volumes.

`scripts/sekaro-demo.sh` includes the override automatically. Running the base Compose file alone after upgrading would select the old database again; do not reuse earlier shortened deployment commands. The existing `reset/remove` commands do not delete the new external PG17 volume. Permanently deleting it is a separate operator action.

If restore or comparison fails, the old database remains selected and the script restarts the application against it. If an error occurs after switching, the script sets aside the failed override, returns to PG15, and restarts the application. Failure to restore the services themselves requires administrator intervention; automatic rollback is not guaranteed during a Docker or host failure.

### Rolling back a completed upgrade

This returns to the data as it existed at upgrade time: later writes to PG17 will not be present in the old PG15 database. Keep both volumes and back up the current PG17 database first.

```bash
cd /opt/sekaro
# Stop the app using the current database configuration.
docker compose --env-file .sekaro-demo/env -p sekaro-demo \
  -f docker-compose.demo.yml -f .sekaro-demo/pg17.compose.json stop demo-app
mv .sekaro-demo/pg17.compose.json .sekaro-demo/pg17.compose.rollback.json
docker compose --env-file .sekaro-demo/env -p sekaro-demo \
  -f docker-compose.demo.yml up -d --no-deps --force-recreate --wait demo-db
docker compose --env-file .sekaro-demo/env -p sekaro-demo \
  -f docker-compose.demo.yml up -d --no-deps --force-recreate --wait demo-app
```

Do not run `down -v` or `docker volume prune` during an upgrade or rollback.

## Backup and restore

- `pg_dump` and `pg_restore` receive credentials through the process environment, without passwords in command-line arguments. Raw stderr is excluded from API responses and regular logs because it may contain SQL and private data.
- Every nonzero `pg_restore` exit code, including **1**, is a failure. `--single-transaction --exit-on-error` prevents accepting a partial restore. `--no-owner --no-acl` restores data without recreating foreign ownership and grants.
- Local backup files use mode 0600 and unique filenames with microseconds. The encrypted `.qbk` package and its preview remain available; the raw upgrade dump is not an encrypted `.qbk` package.
- Temporary restore tokens have a strict format, purpose (`admin`/`setup`), TTL, and single-use consumption. The read path must match that token's file in the protected directory; path traversal and symlinks are rejected.
- API restore requires **restarting** the application with `SEKARO_MAINTENANCE=1`. In this mode, the scheduler, synchronization, startup jobs, and MCP do not start, and normal application routes are blocked. Login, backup/restore, and assets needed to display the form remain available.
- Before restoring, also stop the public unsubscribe service and every other process using the database. The application flag does not stop other containers or SQL clients.
- After restore, the application runs migrations and reloads configuration, but does not automatically recalculate the queue in maintenance mode. Check data and suppression records, reprovision public-service permissions, then remove the maintenance flag and restart the app. Normal startup resumes scheduling.

A database backup does not replace a separate protected backup of the mailbox encryption key, signing secret, `.env`/`.sekaro-demo/env`, and any files stored outside the database. Acceptance must include a restore test, not just checking that a file exists. Restore only trusted dumps: PostgreSQL dumps can contain executable SQL.

## Legacy public unsubscribe service — existing installation compatibility

This section covers the earlier `public_unsubscribe` process with a restricted database role. For new installations and the isolated endpoint without access to the application database, use the [current endpoint guide](PUBLIC_ENDPOINT_OPERATIONS.md).

| Surface | Intended access |
|---|---|
| Panel, login, `/api/*`, API documentation, MCP | Private network/Zero Trust only; app bind `127.0.0.1:5050` |
| `/o/*`, `/c/*`, Beacon, OAuth, Caddy tools | Not exposed by this legacy public service; do not add public proxy exceptions |
| `GET /u/{token}` and `POST /u/{token}` | The public process's only function, on a separate HTTPS domain |
| Other routes on the public domain | 404; no SPA, panel, documentation, or login |
| PostgreSQL | No host port; two Docker networks, with the public process outside the application's network |

`public_unsubscribe` has its own minimal image and dependencies. It does not import the private application or receive mailbox passwords, the encryption key, or JWT secrets. It receives only the `sekaro_unsubscribe` database login, which can execute one boolean-returning function. It cannot read contact, user, or mailbox tables. The `SECURITY DEFINER` function uses a fixed `search_path` and qualified table names; the token is a parameter, not an SQL fragment.

Unsubscribing is idempotent: it records global suppression, pauses all enrollments for the address, and removes unexecuted slots. Slots with an uncertain `SendAttempt` remain with their audit trail. Contact row locks coordinate with the final pre-send check; a message already handed to the transport cannot be recalled. The public process does not send messages or execute webhooks.

Tokens must not appear in public process/proxy access logs. Responses use `no-store`, `no-referrer`, CSP, and frame protection. This package does not change external Cloudflare configuration or publish a new domain.

### Enabling public unsubscribe in production

1. In the private `.env`, set `SEKARO_UNSUBSCRIBE_BASE_URL=https://<separate-domain>` and a random `SEKARO_UNSUBSCRIBE_PASSWORD` (32–128 URL-safe characters). Preserve the existing application encryption keys. The operator must separately prepare the domain and proxy.
2. Build the private application and run its migrations. Provision permissions from the private container:

   ```bash
   docker compose -f docker-compose.sekaro.yml exec -T app python -m app.provision_unsubscribe
   ```

3. Start the public service only after provisioning succeeds:

   ```bash
   docker compose -f docker-compose.sekaro.yml --profile public-unsubscribe up -d --build unsubscribe
   ```

4. Route a dedicated HTTPS host to loopback port 5051, following `deploy/public-unsubscribe.nginx.conf`. Do not route it to 5050. Configure request limits on the host proxy. Verify externally that an invalid token, `/api/auth/login`, `/docs`, `/o/*`, `/c/*`, and `/` all return 404. Use a fictional contact/token to confirm that unsubscribing updates the database.

The profile is optional when upgrading an existing installation, so a missing domain or password cannot start a partially configured service. A deployment using this profile has three services: app, db, and unsubscribe. The demo remains a single demo without public transport.

After restore, repeat provisioning before starting the public service: restore intentionally excludes grants. Changing the password requires recreating the unsubscribe container. Provisioning rejects privileged roles, roles with memberships, roles that own relations, or roles that can still read tables through PUBLIC grants.

Both queue paths use a separate unsubscribe origin. Neither the HTML href nor the plain-text unsubscribe link is wrapped in private application tracking. Previously sent links remain unchanged; plan to preserve their routing before migrating an existing production domain.

## Validation and updates

See [installation](INSTALLATION.md) and [release validation](RELEASE_1.0.md).
