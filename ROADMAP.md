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

## 0.5.x — UI consolidation before further feature work

Before new product features are added, the current UI must be consolidated into one Sekaro design system. Existing redesigned screens are polished first; only then are the remaining legacy screens designed as approved PNG references and implemented.

### Phase A — cleanup and polish before new PNGs
- [x] Treat a missing SMTP/IMAP mailbox as a blocking System Health error, not a warning
- [x] Remove the contradictory green "OK / Brak skrzynek" health card when no mailbox exists
- [x] Keep normal mailbox synchronization informational instead of raising a warning
- [x] Make System Health severity surfaces use Sekaro light/dark theme tokens
- [x] Polish and translate the remaining System Health diagnostics copy to Polish
- [x] Remove stale routed-page imports
- [x] Remove obvious dead login-screen variables and polish first-run/restore copy
- [x] Fix the Dashboard health badge so warnings are not presented as green/healthy
- [x] Replace the decorative sidebar meter with real disk-capacity data and correct severity colors
- [x] Refresh the visible Sekaro UI version for this cleanup baseline
- [x] Audit Dashboard spacing, empty states, status hierarchy and responsive behavior
- [x] Audit Contacts table, drawers, bulk actions, filters and responsive behavior
- [x] Audit Campaign Workspace and isolate remaining embedded legacy campaign surfaces (legacy tabs identified: sequences, recipients, settings, analytics, queue)
- [x] Audit Inbox/Wątki list, conversation view, composer, empty/error states and mobile behavior
- [x] Audit Domains states and diagnostics presentation
- [x] Final Login/first-run/restore visual polish in both light and dark themes
- [x] Remove remaining one-off inline layout styles from redesigned screens where reusable classes should exist
- [x] Verify consistent buttons, inputs, cards, badges, alerts, tables, headings and spacing across redesigned screens
- [ ] Verify loading, empty, error, disabled and destructive states across all active screens (first cleanup pass completed for redesigned screens)
  - Redesigned core screens audited in 0.5.6; legacy screens remain open until their Phase B references are implemented.
- [ ] Verify keyboard focus, labels, contrast and reduced-motion behavior
- [x] Verify light/dark parity and responsive layouts before approving new screen designs
- [ ] Complete Polish copy cleanup on all active screens touched by the redesign (redesigned core and first-run restore pass completed; legacy screens will be translated during their approved redesign)

### Phase B — reference PNGs for screens not yet redesigned
Each screen is designed in dark mode first as the reference, then mirrored 1:1 into light mode. Implementation begins only after the reference is approved. Large functional areas are split into explicit references so no legacy subview is accidentally carried forward.

- [ ] Settings
  - [ ] General / schedule / appearance
  - [ ] Account & security / known IPs
  - [ ] Backup & restore
  - [ ] Features: AI, notifications and email verification
  - [ ] Integrations: API keys, webhooks and MCP
  - [ ] Test mode / development-only settings
- [ ] Campaigns list
- [ ] New campaign / campaign builder
- [ ] Campaign Workspace — remaining legacy tabs
  - [ ] Sequence editor
  - [ ] Recipients / add & review contacts
  - [ ] Campaign settings
  - [ ] Campaign analytics
  - [ ] Queue / activity
- [ ] Inboxes / mailbox configuration
  - [ ] Mailbox list and states
  - [ ] Add/edit SMTP + IMAP
  - [ ] Tracking configuration: app URL, Beacon and DNS/CNAME
- [ ] Templates
  - [ ] Template list + editor/version history
  - [ ] Contact preview, variables and test send
- [ ] Analytics
- [ ] Schedule / sending queue
  - [ ] Queue/calendar view and filters
  - [ ] Message preview
- [ ] Notifications
  - [ ] Notification center
  - [ ] Email notification preferences and event types
- [ ] Lead / contact detail
- [ ] Contact tools — bounced/invalid address recovery (do not duplicate the main Contacts screen)
- [ ] Deliverability tips
- [ ] Final System Health reference only if Phase A shows that layout changes are still needed

### Existing redesigned screens to preserve and refine
- [x] Application shell / sidebar / top bar
- [x] Login
- [x] Dashboard
- [x] Contacts
- [x] Campaign Workspace shell
- [x] Inbox / Wątki
- [x] Domains
- [x] System Health — semantic/status baseline cleaned; final layout review remains part of Phase A

### Design and implementation order
1. Finish Phase A cleanup and regression review.
2. Design Settings (dark, then light; split into the references above).
3. Design Campaigns list.
4. Design New Campaign.
5. Design remaining Campaign Workspace tabs.
6. Design Inboxes.
7. Design Templates.
8. Design Analytics.
9. Design Schedule.
10. Design Notifications.
11. Design Lead Detail and the dedicated bounced/invalid recovery tools view.
12. Design Deliverability Tips.
13. Implement approved PNGs one screen at a time and re-run the cross-screen consistency audit.

**Gate:** no new feature milestone work should take priority over this consolidation until Phase A is complete and the remaining core screens have approved references.

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
