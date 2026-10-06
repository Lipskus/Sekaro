# Backup and recovery

## Four separate components

| Component | Purpose |
|---|---|
| `.qbk` | Portable database backup, manifest and optional AES-GCM encryption. The existing format is retained for compatibility. |
| Remote destination | Optional S3, SFTP or FTPS. Remote transfers require an encrypted `.qbk`. |
| Deployment configuration | `.env`, installer/demo directory and the credential-encryption key. Protect these separately off-server. |
| Pre-update dump | Local `pg_dump -Fc` under `backups/before-update`, without encryption or automatic retention. This is not a `.qbk` file. |

## Configure in the application

As an administrator, open backup settings. Save an encryption password (at least 8 characters) and enable encryption for automatic backups. Configure the existing cron schedule and optional regular local copies, then choose a remote destination. The application supports **one saved remote destination at a time**.

Saving configuration neither tests the connection nor transfers data. A separate test button creates, reads and deletes a non-sensitive probe file. Only running a backup or the scheduled job creates a database copy.

New credentials are encrypted in the database with `SEKARO_ENCRYPTION_KEY`. The API only indicates whether a secret exists. An empty secret field preserves the previous secret for the same service; changing service type requires new credentials. The backup password is encrypted when saved again; older values remain readable. To migrate an older password to encrypted storage, save the encryption settings again with the correct installation key configured.

## Providers

| Type | Requirements |
|---|---|
| S3 | Bucket, access key, secret key and region. An optional S3-compatible endpoint must be an HTTPS origin. TLS certificate verification remains enabled. |
| SFTP | Host, port (default 22), username, password and verified host-key fingerprint `SHA256:…`. This release supports password authentication, not client private-key import. |
| FTPS | Host, port (default 21), username and password. Explicit TLS, certificate verification and encrypted data channel (`PROT P`). Implicit FTPS/990 and plain FTP are not supported. |

Create the S3 bucket beforehand and restrict the account to the selected prefix. Required operations are write, read, list and delete within that prefix. For SFTP/FTPS, the directory is relative to the login directory; missing subdirectories are created. Do not use `..` or grant access to the whole server. Verify the SFTP fingerprint with the host administrator through a separate trusted channel; do not automatically trust an unknown key.

Each installation has a random namespace beneath the configured prefix. Retention only affects recognized filenames within that namespace. A restored database retains its identifier. Another fresh installation will not automatically list the old installation's backups; download them with the provider's client and load them into the file-restore form.

Destinations are configured by administrators. Private/LAN hosts are permitted; restrict application egress at infrastructure level if a strict host allowlist is required. Do not give this administrator account to untrusted users.

## Integrity, retention and failures

- Maximum remote file size: **512 MiB**. Packages are processed in memory, so allow sufficient RAM headroom.
- Before upload, the encrypted package is written to `backups/remote-pending/` with permissions `0600`.
- Sekaro uploads the copy, downloads it again and compares SHA-256. Only then does it remove excess older remote copies (1–365 retained, default 14).
- The pending file is removed after complete success. Enable regular local backup storage separately if local copies are also required.
- Transfer or retention failure leaves the pending copy and records a failure. There is no automatic retry of that same file or cleanup of failed copies; monitor disk space.
- History shows the latest 100 entries. A `pending` entry after restart may indicate an interrupted operation; check both local and remote files before manual cleanup.
- Demo blocks transfers, connection tests and remote downloads. The demo scheduler does not run.

Remote backup requires local storage (`QUICKLY_LOCAL_DISK_BACKUPS=1`) and a persistent `backups` mount. Production Compose configures this automatically. Enabling encryption without a password **stops** packaging; it does not silently fall back to an unencrypted backup.

## Restore a `.qbk`

1. Test recovery on an isolated instance with sending and scheduling disabled first.
2. Preserve the current database, original deployment configuration and credential-encryption key.
3. Select a local file, or refresh the remote list and load a backup into the restore form. This step only downloads the file.
4. Read the metadata, enter the backup password and request a preview. Sekaro decrypts the dump, optionally scans it with ClamAV, validates it with PostgreSQL tools and prepares a short-lived token.
5. Compare the summary with the current database. Separate confirmation replaces the **entire database**, not selected contacts.
6. After reload, check login, contact counts, relationships, campaigns, tasks and mailbox state. Do not enable sending until these checks are complete.

The `.qbk` password and `SEKARO_ENCRYPTION_KEY` serve different purposes. Without the former you cannot open an encrypted backup; without the original latter you cannot read saved mailbox and remote-backup credentials after recovery.

## Raw pre-update dump

The installer's `.dump` file has no `.qbk` manifest and cannot be used in the `.qbk` restore form. Restore it with `pg_restore` into a prepared PostgreSQL database, with the application stopped and compatible schema/image versions. Do not run `pg_restore --clean` on active production without an approved maintenance window and verified backup. `sekaro:previous` alone does not roll back the database.

## Technical references

- [Boto3 S3](https://docs.aws.amazon.com/boto3/latest/reference/services/s3.html)
- [Paramiko SSHClient and host-key policy](https://docs.paramiko.org/en/stable/api/client.html)
- [Python FTP_TLS](https://docs.python.org/3/library/ftplib.html#ftplib.FTP_TLS)
- [ClamAV INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)

Validation status and outstanding operator trials: [STAGE_11_RELEASE.md](STAGE_11_RELEASE.md).
