# Sekaro roadmap

Sekaro is a self-hosted outreach and correspondence platform focused on provider-agnostic SMTP/IMAP mailboxes, campaign scheduling, a unified inbox, reporting, and safe contact handling.

## 0.1 — Foundation
- [x] Sekaro branding
- [x] Local admin account with email + password
- [x] Login by email or username
- [x] Google/Microsoft app-login routes removed from the active application
- [x] SMTP/IMAP is the primary mailbox flow in the UI
- [x] Language framework with Polish, English, German and Russian
- [x] Polish as the default UI language
- [x] Production Compose file for local build + PostgreSQL
- [ ] Finish removal of dormant legacy OAuth modules and provider-specific tests
- [ ] Complete Polish translation of all existing screens

## 0.2 — Mailboxes
- [x] SMTP send configuration
- [x] IMAP reply synchronization
- [x] Encrypted mailbox credentials
- [x] Connection tests and diagnostics
- [x] Sender name / Reply-To
- [x] Mailbox pause/resume
- [x] Robust SMTP Message-ID / References threading
- [x] IMAP TLS / STARTTLS enforcement
- [x] Manual inbox synchronization
- [ ] Remove dormant Gmail/Microsoft provider internals after the SMTP-only regression suite is broader

## 0.3 — Contacts & imports
- [x] CSV import
- [x] XLSX/XLSM import
- [x] Import validation and preview
- [x] Interactive field mapping
- [x] Custom fields from arbitrary spreadsheet columns
- [x] Named contact lists
- [x] Contact-list filtering and filtered CSV export
- [x] Global case-insensitive deduplication for new imports
- [x] Global suppression / do-not-contact list
- [x] Unsubscribe automatically adds global suppression
- [x] Sender hard-checks suppression before every send
- [x] Campaign imports respect suppression
- [ ] Optional merge tool for duplicate contacts already present in legacy databases

## 0.4 — Messages & templates
- [x] Plain-text messages
- [x] HTML messages
- [x] User-defined dynamic template variables
- [x] Contact-field definitions managed inside Sekaro
- [x] Spreadsheet custom fields registered as template variables
- [x] Template versioning
- [x] Reusable templates loadable into campaign sequence steps
- [x] Per-contact preview
- [x] Missing-variable diagnostics
- [x] SMTP test sends
- [x] Editable variable values on contact profiles
- [x] User-defined fields displayed as separate configurable columns in Contacts
- [x] Per-browser column visibility preferences
- [ ] Dedicated "Pola własne" management screen for create/rename/delete workflows
- [ ] Optional variable fallbacks/default values

## 0.5 — Campaigns & scheduler
- [x] Daily inbox limits
- [x] Optional rolling hourly inbox limits
- [x] Scheduler spacing derived from hourly caps
- [x] Minimum interval between messages
- [x] Random jitter
- [x] Sending days/hours and campaign timezone
- [x] Explicit campaign pause/resume
- [x] New campaigns start paused
- [x] Safe queue slot uniqueness
- [x] Durable send claims to prevent concurrent duplicate sends
- [x] Uncertain-delivery state blocks automatic retry
- [x] Campaign pre-flight checks
- [x] Pre-flight validates inboxes, schedule, sequence content, contacts and variables
- [x] Operator reset path for verified non-delivered uncertain attempts

## 0.6 — Sequences
- Multi-step follow-ups
- Stop on reply
- Stop on bounce
- Stop on unsubscribe
- Sequence timing rules

## 0.7 — Unified inbox
- IMAP synchronization
- Conversation threads
- Reply directly from Sekaro
- Associate replies with contact and campaign
- Full correspondence history

## 0.8 — Contact 360 & safety
- Contact timeline
- Simple pipeline/statuses
- Public unsubscribe endpoint
- Global suppression enforcement
- Bounce classification
- Snooze/reminders

## 0.9 — Analytics & domain health
- Campaign reports
- Reply/bounce/unsubscribe rates
- Reports by country/region/custom field
- Mailbox performance
- SPF/DKIM/DMARC checks
- DNS diagnostics
- Domain and IP blacklist checks

## 1.0 — Stable release
- Backup and restore
- Upgrade path and migrations
- Security review
- Complete Polish UI
- Documentation
- Public installation guide
- Stable API surface

## After 1.0
- Additional language coverage
- REST API expansion
- Webhooks
- Optional plugins/integrations
