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
- Plain-text messages
- HTML messages
- Template variables
- Template versioning
- Per-contact preview
- Test sends

## 0.5 — Campaigns & scheduler
- Daily/hourly limits
- Minimum interval between messages
- Random jitter
- Sending days/hours
- Pause/resume
- Safe queue and idempotent sending
- Campaign pre-flight checks

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
