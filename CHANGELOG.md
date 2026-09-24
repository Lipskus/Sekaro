# Changelog

## 0.5.5 — Sidebar storage status

- fixed the System sidebar badge so error/warning severity colors are not overridden by a forced green dot
- replaced the decorative sidebar meter with real disk-usage data
- the sidebar now shows free disk space instead of the static "Panel prywatny" access row
- disk usage is measured on /app/backups by default in production Compose, which maps to the host ./backups filesystem
- added storage capacity to System Health with warning at 85% usage and error at 95%
- storage progress remains green under normal capacity and changes only when the disk is genuinely filling up

## 0.5.4 — UI cleanup baseline

- added a dedicated UI consolidation and remaining-screen design phase to the roadmap
- started the pre-PNG cleanup pass across active redesigned screens
- missing SMTP/IMAP configuration is now a blocking red System Health error
- removed the contradictory healthy mailbox-status card when no mailbox exists
- normal IMAP synchronization no longer raises a warning by itself
- System Health no longer shows a healthy IMAP synchronization card before any mailbox exists
- muting a health category no longer hides its severity from the overall system status
- System Health severity colors now use Sekaro light/dark theme tokens
- real AI / verification errors take precedence over "not tested" warnings
- translated remaining System Health diagnostics and first-run restore copy to Polish
- fixed Dashboard warning-state presentation
- removed stale routed-page imports and dead login variables
- refreshed the visible shell version to 0.5.4
- aligned sidebar health severity with red/amber/green status colors
- improved Dashboard terminology and removed one-off inline layout styling
- corrected Campaign Workspace paused/preflight status semantics, including red blocking states
- polished Contacts destructive actions, field-filter labels and field terminology
- improved Inbox unknown-mailbox status handling and removed one-off inline layout styling
- improved Domains loading, empty and retry/error states
- normalized Contact Import and custom-field manager layout classes
- localized and themed the test-mode banner
- removed the last obvious unused imports found in the redesigned frontend audit
- expanded the redesign inventory to include legacy Campaign Workspace tabs and the active bounced/invalid contact-recovery tools route
- split Settings, Inboxes, Templates, Schedule and Notifications into explicit PNG reference scopes so large legacy screens are not treated as a single design

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
