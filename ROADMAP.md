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
- SMTP send configuration
- IMAP reply synchronization
- Encrypted mailbox credentials
- Connection tests and diagnostics
- Sender name / Reply-To
- Mailbox pause/resume
- Robust message threading

## 0.3 — Contacts & imports
- CSV import
- XLSX import
- Field mapping
- Custom fields
- Global deduplication
- Global suppression / do-not-contact list
- Import validation and preview

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
