# Mailbox storage batch — 2026-09-27

This release combines full IMAP archival, retention settings, authenticated EML download, and mailbox diagnostics. It does not represent completion of the entire 98-board redesign comparison.

## Behaviour

- SMTP mailboxes archive exact MIME bytes from INBOX, including attachments, in PostgreSQL. Existing PostgreSQL backups include this table.
- Default is **keep originals**. Opt-in choices are delete after durable archival or after 1–3650 days **since archival**, not the email's Date header. Changing the IMAP host, port or username restores keep and restarts the archive cursor.
- Existing mail is backfilled oldest first in bounded batches. The separate archive cursor starts at zero on upgrade, even if the conversation mirror previously imported only recent mail. Other folders and Gmail/Office365 OAuth providers are outside this feature.
- Deletion runs after the archive transaction commits, in a separate session. It checks local length and SHA-256, server identity, UIDVALIDITY and the exact original bytes, then uses UID STORE and UID EXPUNGE for that UID only. No blanket EXPUNGE or CLOSE. Servers without UIDPLUS/IMAP4rev2 retain originals and report why.
- Retries preserve local copies. An already absent original is recorded as absent. Failed items rotate behind unattempted items, so one blocked message does not starve the entire archive. At most 20 removals are attempted per synchronization.
- Full archives increase database and backup size. The panel shows archived count and bytes. Removing the inbox also removes its archive through the database foreign key; disconnecting credentials leaves the archive intact.
- Demo transport remains blocked. This release does not enable deletion for any existing mailbox.

## Verification

Local frontend suite: 80 tests and production build pass. Backend coverage includes archive byte integrity, MIME attachment preservation, conservative deletion, malformed responses, UID namespace changes, rollback, age boundary, protected download, and source-change policy reset. Existing SMTP E2E tests use a local SMTP relay and fake IMAP peer. CI installs their dependency explicitly so they are no longer silently skipped.

A dedicated CI check uses an isolated schema in the CI PostgreSQL service to simulate the preceding schema, run migrations twice, verify safe defaults and retained checkpoints, then perform a pg_dump/pg_restore roundtrip of the raw archive bytes.

Deployment visual review remains to be performed after updating the user's existing demo service. The new storage panel is an extension to the mailbox editor, not a claim of 1:1 correspondence to a supplied storage mockup.
