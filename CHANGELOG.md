# Changelog

## 0.5.4 — UI cleanup baseline

- added a dedicated UI consolidation and remaining-screen design phase to the roadmap
- started the pre-PNG cleanup pass across active redesigned screens
- removed stale routed-page imports
- refreshed the visible shell version to 0.5.4

## 0.5.0 — Campaign scheduler safety

- added optional per-inbox rolling hourly sending limits
- scheduler derives a safe minimum spacing from the configured hourly cap
- send workers enforce the hourly cap again immediately before sending
- existing daily limits, jitter, sending windows and timezone scheduling remain active
- new campaigns are created paused by default
- added campaign pre-flight diagnostics before start
- pre-flight validates sending days/hours, timezone, SMTP inbox readiness, limits, sequences and contacts
- pre-flight blocks campaigns when required dynamic variable values are missing
- added explicit Start and Pause campaign actions
- legacy unpause through generic campaign update also requires successful pre-flight
- added durable PostgreSQL send-attempt claims to prevent two workers from sending the same queue slot
- a crash after an external send leaves an uncertain attempt that blocks automatic retry instead of risking a duplicate email
- added operator reset action for an uncertain attempt after delivery has been checked manually
- added scheduler, pre-flight, hourly-limit and send-claim regression tests

## 0.4.1 — Configurable contact columns

- each user-defined contact field is displayed as its own table column
- removed the aggregated "Pola własne" cell from the Contacts table
- added a "Kolumny" picker for system and user-defined fields
- email remains permanently visible as the primary contact identifier
- new user-defined fields are visible by default
- hidden-column preferences persist in the browser
- column labels use Sekaro field definitions when available
- import UI now consistently calls arbitrary fields "Pola własne"

## 0.4.0 — Messages, templates and dynamic variables

- added reusable message templates
- added immutable template version history
- added plain-text and HTML template modes
- added visual HTML editing plus raw HTML source mode
- added user-defined contact fields managed inside Sekaro
- template variables are fully generic and use `{{key}}` syntax
- no business-specific variables such as country/company/land are hardcoded
- imported spreadsheet custom fields become available as template variables
- contact profiles can edit values for user-defined fields
- added per-contact rendered preview
- missing variables stay visible and are reported before test sends
- HTML contact values are escaped before insertion
- added SMTP test sending from the template editor
- reusable templates can be loaded directly into campaign sequence steps
- campaign sender and previews now share the same generic variable renderer
- added regression tests for rendering, versioning, contact fields and SMTP test sends

## 0.3.0 — Contacts, spreadsheets and suppression

- added global CSV, TSV and TXT contact import
- added XLSX/XLSM Excel import
- added import preview with sample rows and validation counts
- added interactive column mapping for email, name, custom fields and ignored columns
- arbitrary spreadsheet columns can be stored as custom fields
- added merge/skip behavior for contacts that already exist
- new imports deduplicate email addresses case-insensitively
- added named contact lists and list filtering
- imports can create or append to a named contact list
- CSV export respects the active contact-list filter
- added global suppression / do-not-contact list and management UI
- unsubscribe links automatically add the recipient to global suppression
- suppression pauses active enrollments and deletes queued sends
- the sender performs a final suppression check immediately before sending
- campaign bulk/CSV imports also respect global suppression
- added parser, suppression and mapped-import regression tests
- legacy duplicate contacts are preserved; a dedicated merge tool is deferred

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
