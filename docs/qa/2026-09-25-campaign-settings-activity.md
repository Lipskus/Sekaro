# Campaign settings and activity — 2026-09-25

Status: implementation and component checks complete; deployed visual acceptance OPEN.
Order requested by user: settings/activity, recipients, sequence, module-wide QA.

## References and changes
Full-size PNGs inspected: 021 (dark settings), 026 (light settings), 024/025 (dark/light queue). The shared final-series theme palette is retained.

- Replace the narrow legacy settings form with a responsive card grid and readiness panel: campaign basics, mailbox selection, local-time schedule, sender identity, shared mailbox limits, stop rules, tracking and message format. Identity and limits display actual mailbox data and link to mailbox settings; no unsupported campaign-level company/signature/UTM values are fabricated.
- Settings retain independent save, pause, guarded start, delete confirmation and existing options. Start saves settings and fetches fresh preflight before using the start endpoint. Generic PATCH never sets paused=false. Invalid days/hours are blocked and failed saves retain edits.
- Replace stacked legacy queue tables with parallel queue/history panels, summary metrics, contact/mailbox filters, progressive row display, queue controls and uncertain-delivery handling. Small screens stack panels; table overflow stays inside panels.
- Contact-to-queue navigation preserves the contact through a URL query parameter.
- Counts use real API data. Today is interpreted in the campaign timezone. Sent-history dates denote send time; reply indicators denote current contact state, not a fabricated reply event timestamp. Missing/failed diagnostics never render a reassuring empty state.
- Fix the legacy queue-recalculation button's nonexistent campaign endpoint by using the existing /schedule/recalculate-all endpoint. Confirmation explains its global scope and shared capacity. The success notice reports task acceptance, not completion.
- Uncertain-attempt reset remains available with explicit delivery-verification confirmation. Backend preflight returns up to 50 slot IDs; the panel explains additional items when present.

## Verification
45 frontend component tests pass, production build passes, git whitespace check passes. Six added regression cases cover save payload semantics, invalid schedule and failed-save retention, fresh start blockers, contact filtering and global recalculation confirmation, uncertain-attempt confirmation, and diagnostics failures.

No send/start/reset/delete operations were executed against deployed campaigns during this implementation. Existing demo data is retained. No new service or second deployment is introduced.

## Remaining acceptance
This code has not yet been rendered on the VPS. After deployment, inspect settings and activity with empty/populated campaigns in Dark/Light, overflow, filter behavior, save failures and loading states. Desktop screenshot viewport previously available was 1363x936, references generally 1600x900 or 1672x941; equal-viewport pixel parity has not been established. Recipients and sequence editors and remaining master-audit modules remain open. This does not certify all 98 boards.
