# Installing and maintaining Sekaro

This guide covers the stage 11 installer, now included in `main`. Select an approved commit before deployment. The operator performs deployment on their own server.

## Requirements

- Linux, Git, Python 3.10+, Docker Engine and Compose v2 supporting `up --wait`.
- Docker permissions and enough disk space for images, dumps and pending transfers.
- Access to the repository, npm/PyPI during builds and container registries.
- Private access through an HTTPS proxy or tunnel. The default binding remains `127.0.0.1`.
- Optional ClamAV requires additional memory (the overlay limits it to 3 GiB); size the host for your data and users.

The installer does not install system packages, Docker, a proxy or TLS certificates. It does not open public ports.

## Fresh installation

```bash
git clone https://github.com/Lipskus/Sekaro.git
cd Sekaro
git switch --detach <approved-commit>
python3 scripts/sekaro-install.py check
python3 scripts/sekaro-install.py install
```

`install` refuses to overwrite `.env` or existing demo configuration. It creates `.env` with random passwords and keys, permissions `0600`, a `backups` directory and `.sekaro-install/compose.json` selecting PostgreSQL 17 for a **new** installation. It then builds the application, waits for readiness and checks the commit label.

Open `http://127.0.0.1:5050` through your secure access path and create the administrator. Set the correct `BASE_URL` in `.env` for generated links and OAuth, then recreate the container through the installation workflow. Never include passwords in issue reports or diagnostic logs.

Keep off-server copies of `.env`, `.sekaro-install/`, proxy configuration and the backup encryption password. `SEKARO_ENCRYPTION_KEY` is required to decrypt credentials stored in the database. A database backup does not replace a deployment-configuration backup.

If the first build fails, the configuration remains on disk. Resolve the reported cause and finish the installation manually as appropriate; do not delete configuration or data volumes. `update` needs a running database to create its pre-update backup.

## Updates

```bash
cd /opt/sekaro
git fetch origin <release-branch>
git switch --detach <exact-commit>
python3 scripts/sekaro-install.py update
python3 scripts/sekaro-install.py status
```

The updater:

1. Checks Docker/Compose and rejects modifications to tracked Git files.
2. Detects demo configuration in `.sekaro-demo/env` and includes an existing `.sekaro-demo/pg17.compose.json`.
3. Runs `pg_dump -Fc` in the correct database container. An incomplete dump is not promoted to a valid backup; failure stops the update.
4. Saves the running container's image as `sekaro:previous`.
5. Builds `sekaro:local` with `org.opencontainers.image.revision`, starts services and compares the running revision.

Local dumps in `backups/before-update/` use permissions `0600`, but **are not encrypted and have no automatic retention**. Protect the disk and remove old dumps manually only after verifying backup and recovery. Automated remote `.qbk` backups are a separate mechanism.

The updater does not change an existing database's major version. Do not replace PG15 with PG17 against the same volume without a proper migration. Preserve existing overrides and earlier migration backups.

## Diagnostics

```bash
python3 scripts/sekaro-install.py check
python3 scripts/sekaro-install.py status
python3 scripts/sekaro-install.py backup
```

`check` does not modify the installation. `backup` creates a local dump of the database detected by the updater. `status` displays Compose service status.

| Symptom | Action |
|---|---|
| Modified tracked files | Review `git diff` and preserve intentional changes. Do not automatically run `reset --hard`. |
| Pre-update backup fails | Check database health, free space and configuration; the application is not replaced at this point. |
| Build fails | The running container remains; inspect build logs and registry access. |
| Application unhealthy after update | Retain logs without secrets and inspect migrations/database health. Do not automatically run an older image against a newer schema. |
| Container commit differs | Do not consider the release deployed; check the Compose project, image and overrides. |
| Missing encryption key | Restore the original key from secure storage. A newly generated key cannot unlock existing credentials. |

## Optional antivirus

```bash
python3 scripts/sekaro-install.py install --antivirus
# Or for an existing production installation:
python3 scripts/sekaro-install.py update --antivirus
```

This flag applies to production Compose, not demo. It persists the choice in `.sekaro-install/antivirus`; later updates retain `docker-compose.antivirus.yml`. ClamAV has no public port. It downloads signatures and scans the **decrypted dump before restore preview**. It does not scan the entire server or all email. Without the flag, the scanner is not required.

When scanning is enabled, scanner unavailability, a detected threat or a size-limit error blocks restore. Wait for signatures after the first start. For large databases, configure suitable ClamAV limits (`StreamMaxLength`, etc.) and test recovery against an isolated database. The application's remote-transfer maximum is 512 MiB.

## Rollback and recovery

`sekaro:previous` preserves the previous image; it does not automatically roll back data. After a migration, returning to an older image may also require restoring the pre-update database. Test the procedure on an isolated database first, then perform production recovery during a maintenance window. See [BACKUPS.md](BACKUPS.md).

### Missing previous application image

A running container can reference an image Docker can no longer tag. In that case the updater stops before building or replacing the application, after creating its database dump. Inspect the Docker error first. If you accept proceeding without preserving that application image, run:

```bash
python3 scripts/sekaro-install.py update --skip-previous-image-backup
```

This explicit update-only option still requires a successful pre-update database backup and verifies the new running revision. It does not reconstruct the missing image. Any existing `sekaro:previous` tag may be stale and must not be assumed to match the pre-update container. Preserve the original deployment configuration and use a compatible image/database pair for recovery.
