# Stage 11 — installer, backups and final acceptance

Status on **6 October 2026**: implementation integrated into `main` through PR #38; **not a stable 1.0 release**. Branding followed in PR #39. These repository changes do not establish that the operator has deployed them. All extensions remain within the same stage 11 scope.

## Implemented

- `scripts/sekaro-install.py`: check/install/update/status/backup; secrets generated only on fresh installation, pre-update dump, commit label and readiness verification. Existing PG15 is not upgraded automatically; demo retains its PG17 override.
- Optional S3/SFTP/FTPS destination in existing backup settings, shared schedule, encrypted credentials, connection test, retention after read-back verification, transfer history and loading into the existing preview/restore flow.
- Local pending copy before transfer, retained on failure. S3/FTPS verify TLS; SFTP requires a pinned SHA256 host key. Demo does not contact external providers.
- Missing encryption passwords stop packaging rather than silently producing plaintext. Manual backup does not report success when no destination succeeds.
- Optional ClamAV scans the decrypted dump before restore preview. When enabled, scanner failure blocks restore.
- Sekaro favicon with a versioned asset URL replacing legacy icon files. Historical `.qbk` format and compatible configuration names are preserved.
- README, installation/update and backup/recovery guides. Current English demo screenshots are presentation material, with provenance documented separately.

## Completed validation

- Stage 11 backend: **633 passed, 9 skipped**, using SQLite without a local PostgreSQL service.
- Frontend: **280/280**; new fields, provider changes, draft preservation after errors, demo restrictions, languages and loading a download into preview without executing restore.
- Production frontend build passed, with the existing bundle-size warning.
- New tests cover unsafe configuration/filenames, fail-closed encryption, retention after round-trip verification, local-copy preservation after failure, secret masking, no network in demo, PG17 override preservation, no secret overwrite, private pre-update dumps and rejecting restore on ClamAV failures.
- PR #38 integration CI passed `demo-network` and `validate`, including PostgreSQL demo startup/login/populated APIs/restart and archive backup round-trip. This does not complete the new installer's or remote providers' acceptance trials.
- No real database was uploaded to a cloud provider, no operator certificates/credentials were used and no messages were sent during those tests.

## Outstanding acceptance gates

| Gate | Required evidence |
|---|---|
| Fresh Docker installation and update of the existing demo | Operator run with healthy containers and matching commit label. Local CLI tests use mocks; no local Docker installation trial was performed. |
| S3/SFTP/FTPS transfers | Operator test accounts: write, read, retention, interruption and local-copy recovery. No actual provider trial has been completed. |
| Stage 11 PostgreSQL recovery | Isolated recovery with the new backup flow and comparison of restored data. Earlier CI archive round-trips do not establish all new restore paths or concurrency behavior. |
| ClamAV | Protocol and rejection tests use a fake server. A real daemon, signature loading and limits require an installation trial. |
| Complete UI acceptance | **Open.** English dashboard and CRM screenshots were captured on 6 October, but do not replace the full checklist below. Earlier browser timeouts were resolved for these captures. |

## UI acceptance checklist after deployment

Review dashboard, contacts/companies, pipeline, tasks/calendar, campaigns/sequences, mailboxes/identities, correspondence, reports, automations and every settings section. Record results, defects and evidence after fixes.

- Desktop, tablet and phone; light/dark; PL/EN/DE/RU.
- Spacing, alignment, long labels, wrapping, no unintended horizontal overflow or clipped dialogs.
- Every control changes state; save and reload where persistent; cancel does not save; errors preserve drafts.
- Loading, empty, error, success and disabled states; keyboard focus and dialog scrolling.
- Calendar entries open details; editing starts only from the Edit button.
- Sekaro favicon after normal/hard refresh, without the old Quickly lightning symbol.
- Backups: provider changes, secrets never returned, connection test blocked for unsaved changes, failed-transfer status and restore only after separate confirmation.
- Known screenshot remnants: Polish demo banner, dashboard import hint and original-language sample/custom-field content. User-provided content should not be automatically translated.

`scripts/check-p0-ui.cjs` uses API fixtures. It can provide layout evidence in a working Chromium environment but cannot replace provider integration or deployment trials.
