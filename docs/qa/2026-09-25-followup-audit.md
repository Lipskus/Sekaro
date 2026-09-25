# Deployed demo follow-up — 2026-09-25

Status: incremental fixes; full 98-board acceptance remains OPEN.

## Baseline and evidence
Authenticated demo at service.marinakeeper.com, asset index-CBolIoW3.js, sidebar 216 px, browser viewport 1363 × 936. Confirmed PR16 deployment (paused campaign progress 67%). References: inventory in png-reference-inventory.json; full-size boards 030 mailboxes light, 046 notifications light and 037 templates dark inspected during this pass, plus earlier campaign/appearance references. Different viewport dimensions prevent a pixel-perfect acceptance claim.

Browser checks: light dashboard, campaign list, schedule calendar/agenda, mailbox list/add dialog, notifications, selected inbox thread and contact activity; dark template editor/history and populated preview, analytics, campaign analytics/sequence, domains and system health. Template preview resolved the selected contact correctly. System health displayed the seeded demo mailbox error. Theme restored to System. No campaign sends, mailbox credentials changes or data resets.

## Fixes from observed failures
- Dashboard counted completed/draft campaigns as active; reuse campaign-list classification.
- Campaign table overflowed available width (1192 px content / 1053 px available): compact accessible row actions and progress column.
- Reduce sidebar spacing; retain scrolling on shorter screens.
- Mailbox labels were glued together by global flex button styles; stack name/email and constrain status filter.
- Existing demo notification event keys bypassed categories; normalize aliases and distinguish warning/error icons.
- Thread activity dates were blank because the API supplies `at`; support direction/kind and wrap campaign labels.
- Translate contact status/activity labels and calendar singular count.
- Template history text collided; grid layout and consistent date formatting.
- Interpret naive backend UTC timestamps consistently, including DST boundaries.
- Analytics reply percentage used lifetime data while counts used the selected range; calculate from range totals. Show unavailable unique-contact data as a dash instead of fabricated zero.
- Remove white zebra rows and pale purple action background from dark campaign workspace; separate step labels and prevent delay labels clipping.

## Verification and remaining work
32 frontend tests pass with TZ=Europe/Warsaw, including status consistency, legacy notification filtering, API activity timestamps, period analytics and DST. Production build passes. CI is the publication gate.

These code changes have NOT yet been rendered on the VPS; rebuild the existing sekaro:local image and restart the existing demo compose project before visual acceptance. No additional service or second deployment is introduced.

Still pending: every Dark/Light pair and state at reference dimensions, post-deployment overflow/spacing checks, complete campaign wizard/preflight and settings layouts. Missing mailbox metrics, domain deliverability data, notification quiet hours and other functional gaps remain tracked in 2026-09-25-png-audit.md. This report does not close full QA.
