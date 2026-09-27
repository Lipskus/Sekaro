# Campaign analytics continuation — 2026-09-27

Status: implemented and regression-tested; post-deploy visual acceptance pending.

Viewed full-size PNGs 022/023 (dark/light). They show four metrics, chart/summary and daily-results/variant-ranking panels. Deployed campaign 1 still had six metrics with duplicate “Odpowiedzi” labels, one wide chart and a lifetime step table without explicit scope. An initial loading snapshot showed zero counters. The sequence still showed the pre-PR24 layout; its deployment was not verified.

Changes:
- Four distinct event counters and responsive two-column panels using shared theme tokens. Tables scroll locally; subjects and controls wrap.
- Daily table and CSV cover the selected range with zero-filled calendar days. Validate dates and bound rendering/export to 366 days.
- Separate loading, error/retry and successful-empty states. Unavailable metrics are not zero. Ignore superseded daily/step requests; step errors retry independently.
- Explicit lifetime scope for steps, sent messages and variant ranking; their existing endpoint does not accept the daily date filter.
- Daily open/click counts include repeated events; distinct IPs are per day, not distinct recipients across the range. Removed misleading conversion percentages from top metrics. Reference delivery/meeting funnel lacks API data, so show a truthful activity summary. No invented delivery confirmations or meetings.
- Keyboard-accessible chart series and step expansion; themed tooltip. Chart no longer intercepts page wheel scrolling. Guard repeated variant mutation clicks.

Validation: 69 frontend tests passed, including seven new checks for failure/retry, stale results, invalid ranges, independent step failures, event semantics, legend toggles, DST-safe daily rows/CSV and successful-empty state. Production build passed (existing chunk-size warning).

Remaining: post-deploy Light/Dark and narrow-screen visuals, browser CSV download and variant expansion. No claim of complete pixel parity for these boards or all 98 PNGs. No live campaign data or sending state was changed in this inspection.
