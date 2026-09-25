# Authenticated demo QA — 2026-09-25

Status: **incomplete; deployment update required before visual acceptance**.

Reference: the 98 PNGs indexed in `png-reference-inventory.json`. The archive
was materialized and its seven contact sheets inspected; campaigns board 063
and appearance board 085 were additionally inspected at full size in this pass.
This is not acceptance of all 98 boards.

## Deployment mismatch

The authenticated demo at service.marinakeeper.com serves
`/assets/index-C6gQV3At.js`, with a 242 px sidebar and 69 px top bar.
The source at main 2e531ce uses 216 px and 64 px respectively. The deployed
campaign list lacks bulk selection/date filters and the mailbox list still uses
the former cards instead of the table already implemented in main.

The demo compose reuses `sekaro:local`; its bind mount replaces only `app/demo`.
Pulling source and restarting alone does not update frontend or other backend
code inside that image. Rebuild the image before repeating visual QA.

The browser viewport was 1363 × 936; final-series mockups are 1600 × 900.
Screenshots from this pass are diagnostic evidence, not a pixel-difference
acceptance comparison. The demo banner also reserves 30 px above the shell.

## Observed and corrected

- Seeded paused campaign: 33 sent messages / 8 contacts incorrectly displayed
  413%. Progress now uses sent / (sent + queued) in either pause state: 67% for
  the observed 33 sent and 16 queued messages. The existing visual clamp alone
  did not fix the label or denominator.
- API counts `total_leads` as send-eligible enrollments, excluding those awaiting
  custom content. Requiring equality with `needs_custom_email` could therefore
  label a blocked campaign as draft/completed. Any outstanding custom content
  now yields “Wymaga poprawek” unless the campaign is explicitly paused.
- Added direct Harmonogram navigation to make the existing queue/calendar
  discoverable; made navigation scrollable in short viewports.
- Mailbox details still exposed “Added” and “app default”; translated them.

## Actual browser coverage

Authenticated dashboard (light), campaigns (light/dark), settings general
(light/dark, theme switching), mailbox list/details (dark), template list/editor
(dark). All observations precede deployment of this patch. Screenshots were inspected
in the browser; file synchronization did not make the new capture available
to attach to this report.

The demo campaign named “Treści do uzupełnienia” is seeded with active enrollments,
not `needs_custom_email`; its name alone does not exercise that blocked state.
The regression is tested with an API fixture. No database was reset.

The remaining layout/functionality gaps and pending states from
`2026-09-25-png-audit.md` remain open. In particular, appearance board 085 includes
controls and a preview absent from the current general-settings section.

## Verification

Frontend component regression tests cover paused/unpaused multi-step progress
and blocked campaigns with zero/prior sends. Production frontend build and
`git diff --check` run for this patch. This is source/build verification;
post-deployment browser verification is still required.

## Updating the existing demo

From `/opt/sekaro`, after pulling the merged main:

```sh
docker build -t sekaro:local .
docker compose --env-file .sekaro-demo/env -p sekaro-demo -f docker-compose.demo.yml up -d --wait --wait-timeout 180
```

This replaces the app image in the existing app + PostgreSQL installation,
keeps the demo database/credentials, and uses the same port 5050.
