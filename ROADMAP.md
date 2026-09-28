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

## 1.1+ — CRM expansion

CRM is a strategic extension of Sekaro's outreach workflow, not a separate product. Campaigns acquire and qualify contacts; the CRM should preserve the full relationship from first outreach through reply, follow-up, meeting, opportunity and customer status. Implementation starts only after the current redesign QA and the 1.0 stability gate are complete.

### Phase 1 — CRM core and central contact model
- [ ] Make each person a central contact record independent of any individual list or campaign, while preserving list membership and campaign history.
- [ ] Add first-class company records with multiple contacts, company-level custom fields, tags and ownership.
- [ ] Provide manual create/edit/archive flows for contacts and companies alongside CSV/XLSX imports.
- [ ] Build a complete contact/company detail view with notes, tags, status, custom fields and a unified activity timeline.
- [ ] Link sent messages, replies, bounces, unsubscribes, campaigns and inbox threads to the same contact record.
- [ ] Add safe duplicate detection and merge with an auditable preview; never merge or delete automatically.
- [ ] Preserve suppression and unsubscribe enforcement independently of CRM status or pipeline stage.

### Phase 2 — sales workflow
- [ ] Add configurable lifecycle statuses and sales pipelines with Kanban and list views.
- [ ] Add opportunities/deals linked to contacts and companies, including stage, value, probability, expected close date and outcome.
- [ ] Add tasks, due dates, reminders, priorities and snooze.
- [ ] Add meetings and follow-ups; begin with internal scheduling and introduce calendar integrations only as optional adapters.
- [ ] Support filters, saved views and bulk actions without bypassing suppression or contact-safety rules.

### Phase 3 — automation and reporting
- [ ] Trigger reviewable automations from events such as reply received, campaign completed, status changed, task overdue or meeting scheduled.
- [ ] Support actions such as creating a task, assigning an owner, changing a stage, adding a tag and scheduling a follow-up.
- [ ] Prevent automation loops and duplicate actions with idempotency, audit logs, limits and pause controls.
- [ ] Add funnel, conversion, activity and revenue reports connected to outreach source, campaign, mailbox and custom fields.
- [ ] Add dashboards for overdue work, inactive opportunities and contacts requiring follow-up.

### Phase 4 — users, permissions, collaboration and integrations
- [ ] Add an administrator-facing user-management screen for creating/inviting users, editing profiles, activating/deactivating accounts and safely resetting access.
- [ ] Add optional multi-user ownership, teams, role-based permissions and per-record activity attribution.
- [ ] Provide built-in roles as a safe baseline and configurable permissions for viewing, creating, editing, exporting, sending and deleting.
- [ ] Define access boundaries for contacts, companies, opportunities, tasks, mailboxes, campaigns, templates, settings, integrations and reports.
- [ ] Record security-relevant user and permission changes in an audit log; deactivation must preserve historical attribution.
- [ ] Add opt-in calendar, webhook and API integrations after the stable internal CRM workflow is complete.
- [ ] Keep single-user/self-hosted deployments simple: collaboration features must not add mandatory services or weaken the minimal deployment model.

### CRM delivery gates
- [ ] Define the domain model and migrations before UI implementation; existing contacts and campaign history must remain intact.
- [ ] Produce approved Dark/Light references for the contact/company detail, pipeline, opportunity and task views.
- [ ] Ship Phase 1 before pipeline automation so Sekaro has one reliable source of truth for contact history.
- [ ] Validate upgrades, backups/restores, permissions, auditability and responsiveness at every phase.
- [ ] Treat CRM work as multiple planned releases rather than one large rewrite; the outreach and sending engine must remain independently testable.

## 1.2+ — Native email-provider adapters

Generic SMTP/IMAP remains the provider-agnostic default. Native adapters are optional enhancements for providers whose APIs offer safer authentication, richer mailbox synchronization or reliable delivery events. They must use one internal mailbox/transport contract so campaigns, threading, suppression and analytics behave consistently regardless of provider.

### Microsoft 365 / Exchange Online
- [ ] Add a clean Microsoft Graph mailbox adapter rather than reviving dormant legacy provider code.
- [ ] Support OAuth-based connection, token refresh, explicit consent scopes and secure encrypted token storage.
- [ ] Support sending, reading primary and shared mailboxes, reply synchronization, folders and conversation/thread identifiers where Graph exposes them.
- [ ] Use Graph change notifications/webhooks with renewal, reconciliation polling, deduplication and recovery after missed or expired subscriptions.
- [ ] Separate mailbox authorization from Sekaro application login; connecting Microsoft 365 must not add Microsoft sign-in as a required admin-login method.
- [ ] Document delegated versus application permissions and require the least privilege appropriate to the selected deployment mode.

### Google Workspace / Gmail
- [ ] Add a native Gmail API adapter for authorized mailbox access, sending, labels and threads.
- [ ] Support OAuth-based connection, token refresh, explicit consent scopes and secure encrypted token storage.
- [ ] Use Gmail push notifications with watch renewal, history reconciliation, deduplication and recovery after missed notifications.
- [ ] Preserve Gmail thread/message identifiers while mapping them into Sekaro's common conversation and contact timeline.
- [ ] Separate mailbox authorization from Sekaro application login; connecting Google Workspace must not add Google sign-in as a required admin-login method.
- [ ] Document restricted/sensitive OAuth scopes, verification requirements and least-privilege deployment options before public distribution.

### Amazon SES
- [ ] Add Amazon SES as an optional outbound transport through the AWS API; do not present SES as a complete inbox provider.
- [ ] Support regions, verified identities/configuration sets and securely stored credentials with least-privilege IAM guidance.
- [ ] Ingest SES delivery, bounce, complaint, rejection, delay, open and click events through a verified event endpoint, with idempotency and signature/source validation.
- [ ] Map SES events into the existing delivery-attempt, suppression, analytics and System Health models.
- [ ] Require a separate supported inbound/reply source when two-way correspondence is needed; SES outbound alone does not replace IMAP or a mailbox API.
- [ ] Do not target Amazon WorkMail as a new native integration because AWS has announced end of support on 2027-03-31.

### Adapter framework and later providers
- [ ] Define capabilities per adapter (send, receive, folders, threads, webhooks, delivery events and shared mailboxes) so unsupported functions are shown honestly.
- [ ] Keep rate limits, retries, uncertain-delivery handling, audit logs and provider-specific diagnostics isolated behind the common contract.
- [ ] Add provider connection tests, health status, reconnect/re-consent flows and migration back to generic SMTP/IMAP where technically possible.
- [ ] Evaluate native Zoho Mail and standards-based JMAP/Fastmail adapters only after the Microsoft 365, Gmail and SES adapter contract is stable and real demand justifies maintenance.
- [ ] Keep every native provider optional: the minimal self-hosted Sekaro deployment must continue to work with custom SMTP/IMAP only.

Official planning references:
- [Microsoft Graph mail API overview](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview)
- [Microsoft Graph change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- [Gmail API overview](https://developers.google.com/workspace/gmail/api/guides)
- [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push)
- [Amazon SES event publishing](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html)
- [Amazon WorkMail end of support](https://docs.aws.amazon.com/workmail/latest/adminguide/workmail-end-of-support.html)

## Planned after redesign QA — configurable installer and optional antivirus

Requested 2026-09-28. Planning only: no antivirus is installed or enabled by this entry, and no application rebuild is required for this documentation change.

- [ ] Build an idempotent installation/configuration wizard with reviewable configuration, prerequisites/resource checks, generated Compose profiles, connection tests and an upgrade path that preserves data and secrets.
- [ ] Offer explicit antivirus choices: **disabled**, **local optional ClamAV service**, or **existing remote scanner**. The disabled option must not install, start or allocate resources to an AV container.
- [ ] Keep AV optional and separate from the minimal app/database/public-unsubscribe deployment. Allow changing the choice after installation.
- [ ] Scope the initial integration to Sekaro uploads, imported files and mail attachments. Document that scanning application files is not whole-host endpoint protection; host-wide AV requires a separately designed deployment.
- [ ] For local ClamAV, check available resources with headroom for Sekaro/PostgreSQL and signature reloads; warn when insufficient. Do not recommend this profile on the current approximately 1 GiB VPS. Establish requirements from benchmarks, not a claimed zero-overhead scanner.
- [ ] For remote scanning, support streaming to an operator-controlled ClamAV instance over a private authenticated/encrypted network (e.g. NetBird/WireGuard), with connection tests, timeouts and a concurrency limit. Never expose the unauthenticated/unencrypted clamd TCP endpoint publicly.
- [ ] Show separate clean/detected/not-scanned/error states; scanner downtime or an oversized/encrypted unscannable file must not be presented as clean. Define quarantine/release policy before implementation; no automatic destructive deletion.
- [ ] Cap scan size, archive expansion, time and parallelism; keep scanning off interactive request paths where appropriate. Display scanner health and signature freshness.
- [ ] Benchmark peak RAM/CPU during signature updates and scans, latency and queue behavior on representative MIME, PDF, Office and archive files. Validate with EICAR and outage tests.
- [ ] Evaluate additional remote/commercial adapters only after checking integration API, licensing, privacy and measured resource needs. External cloud uploads must be an explicit opt-in; no default submission of correspondence to public scanning services.

Research baseline (2026-09-28):
- [ClamAV requirements](https://docs.clamav.net/): 3 GiB+ minimum recommended RAM, 3–4 GiB guidance for constrained environments; other applications require additional resources. Applies to both ClamScan and ClamD using the standard signature database. On-demand scanning removes a resident daemon but does not remove scan-time memory requirements.
- [ClamAV scanning](https://docs.clamav.net/manual/Usage/Scanning.html): clamd TCP has no built-in authentication/protection; remote scanning requires network isolation and protected transport.
- [ESET Server Security for Linux 12.1](https://help.eset.com/essl/12.1/en-US/system_requirements.html): installation minimum 2 GB RAM and 2 x64 CPU cores. These are vendor system requirements, not measured scanner RSS or proof of lower overhead for Sekaro.
- [Linux Malware Detect](https://www.rfxn.com/projects/linux-malware-detect): focuses on shared-hosting threats such as web shells and injected backdoors; not established as an equivalent lower-resource scanner for general email attachments.
- [VirusTotal API terms](https://docs.virustotal.com/reference/public-vs-premium-api): the public API is not suitable as a free commercial-product scanning backend.

Recommendation: offer all three deployment choices, with remote operator-controlled ClamAV as the candidate for low-memory Sekaro hosts. No claim that a lighter equivalent has been demonstrated; validate before implementation. Schedule installer work after current redesign QA and the planned focused refactoring.

## After 1.0
- Additional language coverage
- REST API expansion
- Webhooks
- Optional plugins/integrations
