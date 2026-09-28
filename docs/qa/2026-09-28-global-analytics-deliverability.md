# Global analytics and deliverability guide — 2026-09-28

## Live baseline and reference review

The user updated the VPS after PR #32. Fresh navigation serves CSS `index-DVeyT84J.css` and JS `index-CoRq6TyR.js`; the CSS matches the PR #32 build. Main baseline is `3cdb29663febd306ae6bafd0a1187ad29ea45d81`. This identifies the frontend build, not the server Git HEAD/backend image (no SSH).

Verified notification rows now align to the left. Opened a previously read demo thread, entered a temporary reply draft, attempted navigation, and confirmed the leave dialog appeared. Cancelling retained the exact draft. Cleared the test text without sending. The updated deliverability disclosure button expands its explanatory text. No messages, synchronization, suppression changes or destructive actions were performed. Theme was restored to System after checking Dark.

Compared live global analytics and deliverability in Light and Dark at approximately 1353×929 with PNG boards 032–033 and 057–058. Observed: six overlaid filled chart series, an unlabelled full-width chart, excessive vertical separation of filters, and an overly wide table mixing period results with lifetime queue/progress. The deliverability screen showed generic guidance as metric cards without clearly distinguishing it from measured results. The Dark and Light deliverability references differ structurally, and many mockup measurements lack a backend source.

## Changes in this batch

- Global analytics: a shared filter card before results; four summary cards; a two-column activity chart and event summary; a compact seven-column campaign table. Responsive rules collapse columns, wrap controls and contain table scrolling. Palette follows the existing theme tokens.
- Default chart shows sent/replies, with all six series available via accessible buttons. Reduced area opacity, Polish date labels, integer counts. Removed implicit wheel capture; custom dates provide an explicit way to narrow the interval without trapping page scrolling.
- Period metrics are separated from explicitly labelled lifetime queue/progress. Zero sends yield an undefined ratio (`—`), and ratios above 100% remain visible. Explain that activity may refer to older sends and that unique IP counts are per day and campaign, not deduplicated recipients.
- CSV export uses the existing tested daily aggregation/export helper, includes missing days and selected campaigns, and is disabled while loading, failed, invalid or empty. No endpoint was added.
- Reject invalid or >366-day custom intervals before requesting/allocating daily chart rows. Ignore obsolete responses; a delayed server-clock response cannot reset an edited range. Campaign metadata has an independent error/retry state rather than a false empty list.
- Deliverability: guide introduction, configuration checklist with keyboard-operable disclosures, grouped category controls, a right-hand tools panel linking to existing pages, and a semantic reference table. Existing guide values are explicitly labelled as guidance rather than current measurements or guarantees. No new deliverability recommendations or fabricated measurements were added.

## Validation and remaining scope

125 frontend tests pass, including seven new tests for range/clock races, filtering, metadata failure/retry, undefined/over-100% ratios, CSV export, oversized ranges and guide disclosure/navigation. Production build and `git diff --check` pass; the pre-existing large-chunk advisory remains. Full CI must pass before merge.

The live screenshots above belong to PR #32. This batch still needs deployment and visual verification. Mobile viewport rendering has not been tested in the current browser; responsive CSS alone is not visual acceptance.

No fabricated delivery rate, meeting funnel, segment ranking, DNS checks, reputation score, blacklist results or incident history was introduced. Those reference controls need backend work. Full 98-board pixel parity remains OPEN, including reference-sized captures, remaining states and final spacing acceptance.
