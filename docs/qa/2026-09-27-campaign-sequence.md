# Sequence layout follow-up — board 017

## Deployment check

Confirmed PR #23 on the demo instance: first three recipient rows measured 96.39 px, down from 223 px. Document width and viewport width both measured 1353 px; horizontal overflow stays inside the table. No campaign data or sending state was modified during this check.

## Sequence changes

Replace the 288 px step rail and joined detail area with two separately bordered panels: a wider timeline and a detail/editor panel. Step cards show wrapped subjects, safe plain-text body excerpts, cumulative send day, HTML/personalized indicators and A/B variant counts. Each step has a direct, labelled edit action. Add-step action moves to the timeline heading. Layout stacks below 1100 px and wraps editor controls on smaller screens.

Preserve standard/personalized content, templates, existing message preview, variants and individual messages. No unsupported AI optimization, test-send or delay-only step features are invented from the reference.

Fix dirty edit loss when selecting another step, editing another step or adding a step. The shared accessible confirmation dialog retains the current draft when cancelled and performs the intended navigation only after explicit discard. Open variant forms also require confirmation before switching panels. A successful delete closes the editor for the deleted step; a failed save retains its draft.

## Validation

Frontend suite: 62 tests, including five sequence cases covering cancelled switch, confirmed discard, add navigation/failed save, cumulative days/safe excerpts and deletion cleanup. Production build and full PR CI required.

## Remaining acceptance

The new layout requires live verification after deployment, including Dark/Light, narrow screens, long subjects, personalized messages and variants. This is a sequence layout pass, not complete 1:1 acceptance of all 98 boards. Routing away to another campaign tab still uses the application's existing navigation behavior; the new dirty guard covers navigation within the sequence panel.
