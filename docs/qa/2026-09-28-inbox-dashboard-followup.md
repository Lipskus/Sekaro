# Inbox and dashboard follow-up — 2026-09-28

## Deployed baseline

The user confirmed deployment after PR #31. Live HTML serves CSS `index-DwGIbach.css` (matching that build) and JS `index-DZ2mskiS.js`. Repository baseline is main `aa6e451ef280bad97a6b1a8963285726b2b2559f`. Browser inspection confirms the frontend changes; it does not establish the server's Git HEAD or backend image identity because SSH is unavailable.

Inspected populated dashboard, calendar, notification center, preferences, health diagnostics, mailbox list and thread view. Calendar and notifications were inspected in Light/System and Dark at approximately 1353×929; the Dark calendar no longer has white zebra rows. Compared calendar structure with board 034. Its crowded demo slots are taller than the reference, and this is not a 98-board pixel-parity sign-off.

Selecting an unread notification preserved the unread count (5), as intended. A preference draft triggered the leave confirmation; cancellation retained it and discard removed it without saving. The diagnostics attention filter showed one issue among eight checks. The notification content is visibly centered with excessive left space in both themes; this batch corrects that alignment. Opening the already-read demo conversation used the existing mark-read flow. No messages were sent, no synchronization was triggered, and no notification was deleted. Theme was restored to System through the settings save flow.

## Changes

- Inbox: guard drafts in all visited threads when leaving through ordinary in-app links and warn on reload. Keep drafts on failed sends. Serialize send before confirmation, sync and suppression actions. Refresh unread counters after mark-read.
- Inbox templates: bind preview to thread and draft revision; discard delayed results after thread changes or user typing. Show loading state and prevent sending during template replacement. Suppression responses are likewise bound to their original thread.
- Dashboard: explicit initial loading/failure, retry, request generation protection for range changes, hide stale charts when a new range fails, and show unavailable health instead of stale success.
- Domains: ignore obsolete reload responses and group case-insensitive domain names consistently with the dashboard.
- Shell: clear old search results and errors as a query changes, trim queries consistently and display the actual user role.
- Visual/accessibility: left-align notification rows; use native, keyboard-operable disclosure buttons with expanded state and hidden content for deliverability tips.

## Validation and limits

- Frontend suite: 118 passing tests, including eight new tests for delayed template rendering, thread switching, draft navigation, duplicate sending, failure retention, unread counts and dashboard loading/range races.
- Production frontend build succeeds; the existing large-JavaScript-chunk advisory remains.
- Full repository CI, including backend tests, PostgreSQL demo/backup checks and Docker network migration, is required before merge.
- These new changes require user deployment and a subsequent browser check. Current live screenshots belong to PR #31.
- Drafts remain in component memory, not durable storage. Browser Back, programmatic logout and same-route query navigation are outside the ordinary-link guard. Durable drafts and a router-wide navigation guard remain follow-ups.
- Mobile viewport verification, whole-app Light/Dark reference measurements and unsupported backend features listed in the previous report remain open. This batch does not complete full visual parity.
