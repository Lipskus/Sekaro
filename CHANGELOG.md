# Changelog

## 1.1.1 — 2026-10-13

- Rebuild mailbox setup from the approved mockup: sender details, adjacent SMTP/IMAP cards and separate test results.
- Keep Add and Cancel visible outside the scrolling form, including smaller screens.
- Consolidate limits, warm-up and tracking into one advanced section.
- Add shared SMTP/IMAP credentials, password visibility and explicit security selectors.
- Check responsive light/dark layouts and fixed-footer accessibility in Polish and English.

## 1.1.0 — 2026-10-13

- Test SMTP and IMAP before saving a mailbox, and retest existing mailboxes with separate persisted results.
- Distinguish mailbox activity, connection diagnostics and public tracking capability.
- Prevent enabling tracking when the configured endpoint mode or mailbox assignment does not support it.
- Standardize contact language across manual entry, editing, bulk assignment, imports and filtering, with explicit migration from custom fields.
- Add campaign default language, multilingual delivery, step and A/B translations, and language-specific mailbox signatures.
- Block missing translations by default; allow explicit whole-step fallback to the campaign default language.
- Use the same language resolution for previews, test messages, preflight and both send workers.
- Preserve the language and rendered content of new deliveries for later conversation quotes.
- Add idempotent database migrations preserving existing contacts, campaigns and signatures.

See [1.1 usage and upgrade notes](docs/RELEASE_1.1.md).

## 1.0.0 — 2026-10-12

First consolidated Sekaro release.

- Contacts and companies, imports, groups, custom fields, archival, merge and CRM history.
- Sales pipeline, opportunities, tasks, meetings, calendar, reports and auditable automations.
- Campaign sequences, scheduling, personalization, previews and delivery safeguards.
- SMTP/IMAP, optional Gmail and Microsoft 365, mailbox identities, footers and S/MIME.
- Unified conversations with local Archive, Trash and restoration, preserving mail and CRM history.
- Users, roles, teams, API permissions and audit history.
- Private administration, optional isolated public endpoint, pairing and authenticated event synchronization.
- Installation/update tools, diagnostics, encrypted backups and optional S3/SFTP/FTPS destinations.
- Polish, English, German and Russian interface; light/dark themes and responsive screens.
- Consolidated release documentation and version 1.0.0 in the application.
- Removed historical QA captures, work logs, obsolete release automation and upstream-image deployment recipes.

Existing database identifiers, backup formats and configuration aliases remain
compatible. See [release scope and validation](docs/RELEASE_1.0.md) for limitations.
