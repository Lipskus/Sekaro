# Schedule, notifications and diagnostics — 2026-09-28

## Deployed baseline verified

Live `https://service.marinakeeper.com` serves PR #30's contact workspace: CSS `index-kD_C7IIK.css`, JS `index-CKKkjlSz.js`. This verifies the frontend bundle, not the server's Git HEAD (no SSH access). Current repository main is `9f4ab61`, whose change since PR #30 is installer/antivirus roadmap documentation.

The live contact profile `/leads/60` shows the summary, activity, campaigns and messages tabs. An unsaved name edit triggered the leave confirmation; cancelling preserved the draft, discarding restored the original name. No contact data was saved. Activity and the empty messages view rendered correctly.

Live schedule, message preview, notifications and preferences were inspected in Light/System and Dark at approximately 1353×929. Theme was restored to System through the settings save flow. No live send, sync, queue recalculation, notification deletion or mailbox setting mutation was performed.

## Reference review and changes

Reviewed PNG boards 034–036, 045–046, 048–051 and 097–098. These differ from one another and include backend features not currently available; this batch does not claim pixel equality with every board.

- Calendar: fixed visible white zebra rows and legacy light borders in Dark; compact two-line campaign blocks, visible filter labels, bounded agenda with the full-queue action outside its scrolling area. Hidden-weekend/range/timezone changes cannot retain an invisible selected block. Events sort by actual UTC instants. Message preview scrolls into view and reports/retries failures.
- Queue: filtered counts describe the loaded range, sections support keyboard activation, UTC timestamps are parsed consistently, an unavailable strategy is shown as unknown. Development validation now renders issue details. Recalculation uses the authenticated API client, serializes operations and never reports success solely because polling timed out.
- Notifications: separate accessible selection and deletion buttons, explicit mark-as-read, token-based row/detail surfaces, stronger unread state, expanded message detail. Unread pagination uses the unread count (the API's total is global). Mutations serialize and refill from offset zero so removed/read records do not shift the next page past unseen records. Stale responses are ignored after tab changes. Search explicitly covers loaded records only.
- Preferences: channel explanation, event rows, save/discard bar, native email/number validation, accessible input names, save lock, disabled fields while saving, preserved failed drafts and inline errors. In-app links and full reload warn about unsaved drafts. Browser Back navigation remains outside this guard, matching the existing contact editor limitation.
- Diagnostics: quick links to existing tools, status legend and result filter. Informational entries are excluded from problem counts. Failed refreshes hide stale check cards and disk readings, including the sidebar; retries retain unknown status until success. Refresh requests coalesce, and results from an earlier user/session cannot replace current data.

## Validation

- Frontend suite: 110 tests (14 new regression tests for notifications, calendar, queue and diagnostic request lifecycle).
- Production frontend build succeeds; existing large-chunk advisory remains.
- Backend regression suite: 111 passed (archive, SMTP, SMTP E2E, contact import, templates, scheduler, redesign and demo).
- `git diff --check` clean.
- Full CI including PostgreSQL/demo restart and network/migration checks must pass before merge.

## Remaining verification / supported scope

This code is not yet deployed on the user's VPS. Dark/Light screenshots and interaction verification of the new build are still required after deployment; the live screenshots reviewed above belong to PR #30. Mobile and final whole-app visual QA remain.

The reference boards' notification digests, quiet hours, per-channel event matrix, additional chat channels and temporary mute dialog need backend design. Diagnostics has no CPU/RAM history, task/log history, worker restart or ZIP export endpoint. Queue preview does not expose arbitrary rescheduling, inbox replacement, skip or send-now operations. These controls were not fabricated. Existing real scheduling, mailbox and campaign routes remain the available actions.
