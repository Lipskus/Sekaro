# Responsive and final reference audit — 2026-09-28

Status: correction batch complete; full 98-board pixel parity remains **OPEN**.

Baseline: deployed PR #33 (`b4b37cf`) with the pending analytics contrast change from `qa/pr33-live-contrast-2026-09-28` (`5e68d23`). References: all 98 files from `sekaro-ui-mockups-98.zip`; every board was reviewed in contact sheets and the existing full-size route mapping was reconciled.

## Live Dark/Light coverage

The deployed application was inspected in Dark and Light at approximately 1363×936. The following 17 route families were loaded and measured: dashboard, campaign list, campaign builder, populated campaign workspace, contacts, populated contact profile, contact tools, templates, mailboxes, Inbox, domains, schedule, analytics, settings, deliverability guide, system health and notifications.

- Document width equalled the available viewport width on every completed route. No page-wide horizontal overflow was observed.
- Tables remain inside their scrolling surfaces. The only automated overflow candidates were intentionally visually-hidden file inputs and truncated Inbox snippets.
- Campaign bulk selection and its confirmation modal were opened without executing the operation. The modal was correctly bounded, but its destructive confirmation used the normal green primary action.
- Main populated list/workspace states, settings navigation, tabbed editors and the shared shell were inspected. Existing component tests cover loading, error, empty, stale-response, draft, retry and partial-failure states; this is not a visual sign-off for every state board.
- Theme was restored to `System` after the comparison. No campaign, contact, mailbox, notification or message was changed, sent or deleted.

## Corrections in this batch

- Analytics keeps the pending PR #33 live correction: the sent series uses the brighter theme accent and inactive legend buttons are no longer artificially dimmed.
- Irreversible confirmation dialogs now use a destructive title and red action treatment. Ordinary confirmations retain the primary treatment. Existing string callers remain compatible and structured overrides are supported.
- Opening the mobile navigation locks background scrolling and restores the previous body state on close/unmount.
- At narrow breakpoints, page actions and filters may wrap without escaping the viewport; modal height is bounded to the dynamic viewport; headings wrap; modal content contains overscroll; very narrow modal actions stack to full width.
- Added regression tests for menu scroll locking and destructive/non-destructive confirmation semantics.

## Reference comparison outcome

The final deterministic series (063–096) remains the canonical shared shell: 216 px sidebar, 64 px header and the token palette recorded in `2026-09-25-png-audit.md`. Older boards use different shell widths, palettes and compositions, so simultaneous pixel identity across all generations is impossible.

| Boards | Area | Current result |
|---|---|---|
| 013–016, 063–070, 081–082 | Campaign list, setup and states | Main Dark/Light layouts are implemented and live at desktop. Tables, bulk state and preflight behavior are covered. Exact reference-size and narrow visual captures remain open. |
| 017–026 | Campaign sequence, recipients, settings, analytics and queue | Functional workspaces exist and have regression coverage. Several boards use richer/different compositions; exact visual parity remains open. |
| 027–031, 071–080 | Mailboxes, diagnostics, health, logs and sync | List/editor and real diagnostics are present. Dedicated history/reputation/log dashboards require backend data; see the separate gap report. |
| 032–036, 051, 061–062 | Analytics and schedule | Main populated/error/empty states are implemented. Contrast correction is included. Unsupported queue mutations are not shown. |
| 037–040, 059–060 | Templates | Editor, preview, test, history, loading/error/empty and draft protection exist. Category/usage metrics and editable preview overrides are not fabricated. |
| 042–050, 052 | Contact detail and notifications | Main workspaces and state handling exist. Notification quiet hours/digests and some engagement panels require backend support. |
| 053–058 | Contact recovery and deliverability | Recovery tools use real states. Deliverability remains explicitly a guidance view, not a fabricated reputation dashboard. |
| 001–012, 083–096 | Settings | All implemented categories are reachable and responsive source rules are present. Several reference dashboards combine unsupported security/history/integration data. |
| 097–098 | System health | Real checks and neutral unavailable states are shown. Historical resource graphs, job/log history and restart/export actions are absent by design. |

## Acceptance boundary

Desktop Dark/Light route coverage and source-level responsive corrections are complete for this batch. The available live browser viewport did not provide tablet/mobile or exact 1600×900 / 1672×941 captures, so responsive visual acceptance and per-board pixel parity are still open. The package must not be described as full 1:1 compliance.

## Post-deployment regression follow-up

After merge commit `87c205b` was deployed, all 17 route families were measured again at 1353 px in both Dark and Light. Document and body widths matched the viewport on every route, with no page-wide horizontal overflow. The language was restored to Polish and the theme to `System` after testing.

Two user-reported language regressions were reproduced and corrected in the final follow-up branch:

- the redesigned shell no longer ignores the saved language; navigation, search, system status, profile actions and the appearance settings react immediately for Polish, English, German and Russian;
- the login language/theme controls explicitly use the dark native color scheme and dark option surfaces, preventing the transient light selection surface on a dark login screen.

The login form's primary labels and state copy now use the same translation source, the document `lang` attribute follows the selected language, and a regression test verifies immediate shell translation plus local persistence. This follow-up still does not convert every feature workspace body to full multilingual content; unsupported or untranslated feature copy must not be presented as complete application-wide localization.
