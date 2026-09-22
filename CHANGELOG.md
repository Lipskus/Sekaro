# Changelog

## 0.2.0 — SMTP/IMAP mailbox core

- SMTP is now the default mailbox provider for new Sekaro inboxes
- added optional per-inbox Reply-To
- campaign sends and manual replies use the configured Reply-To header
- IMAP authentication is always protected by implicit TLS or STARTTLS
- SMTP/IMAP mailbox passwords use encrypted-at-rest columns
- added native `SEKARO_ENCRYPTION_KEY` support with legacy-key compatibility
- System Health warns when the mailbox encryption key is not supplied outside PostgreSQL
- added manual IMAP synchronization in Odebrane
- fixed threading for replies to messages sent manually from Sekaro
- fixed IMAP UID checkpoint handling so normal backlogs do not silently skip messages
- first mailbox sync intentionally imports the newest bounded set of messages for fast startup
- added SMTP/IMAP regression tests to CI
- added Reply-To and STARTTLS tests

## 0.1.1 — Sekaro identity and SMTP/IMAP cleanup

- reworked the visible application around Sekaro branding
- Polish is the default UI language
- added PL/EN/DE/RU language infrastructure
- localized the main navigation and the most-used screens
- renamed Leads to Contacts in the Polish UI
- renamed Unibox to Odebrane in the Polish UI
- removed Google/Microsoft app login from the active application
- removed Gmail/Office 365 mailbox selection from the active mailbox UI
- SMTP/IMAP is now the primary mailbox workflow
- removed OAuth token health checks from the active health dashboard
- system health now focuses on SMTP/IMAP connectivity, inbox status, synchronization and tracking
- removed Gmail-specific synchronization settings from the visible Settings UI
- removed legacy provider matching from campaign creation/settings
- provider matching defaults to disabled and existing campaigns are migrated to disabled
- added a production-style Sekaro Compose file and GitHub CI build validation
- local email/password authentication remains the default admin login

This release is still part of the foundation phase. Legacy provider-specific modules remain in the repository where they are still referenced by inherited internals; they will be removed or replaced safely during the SMTP/IMAP refactor rather than deleted blindly.

## 0.1.0 — Fork foundation

- initial Sekaro fork
- local PostgreSQL deployment
- local-build Docker image
- local administrator authentication
- initial rebranding and roadmap
