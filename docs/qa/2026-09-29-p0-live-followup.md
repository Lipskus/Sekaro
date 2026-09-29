# P0 live follow-up — 2026-09-29

## Scope and observations

Inspected the existing service.marinakeeper.com demo after user authentication through Cloudflare Access and Sekaro. No second deployment was created. No messages, connection tests, invitations, destructive actions or configuration saves were performed.

Live inspection used the available 1363×936 browser viewport in the light theme. It is not a tablet/mobile or full reference PNG acceptance run. Exact server commit was not independently exposed by the UI; version label still reads 0.5.6.

| View | Observed result |
| --- | --- |
| Dashboard | Loaded demo data; disk information and diagnostic status visible. |
| Contacts | 60 records loaded. Contact 52 profile retained the Unsubscribed label and campaign opt-out status. No edit or restore performed. |
| Inbox | 12 conversations loaded. Selected conversation 1 displayed messages, contact details and correspondence status. No horizontal document overflow at the tested width (1353 px document / 1363 px viewport). |
| System health | The reported SMTP/IMAP failure explicitly identifies a synthetic DEMO IMAP error for the Partnerzy mailbox. |
| Campaign 1 | Overview, schedule, sequence steps and preflight results loaded. No campaign state or schedule changed. |
| Sequence preview | Contact placeholders resolved correctly; Escape closed the preview. Legacy wrapper lacked dialog semantics and used a separate modal layout. |
| Mailbox 1 | Editor opened; retention options keep / after archive / after days and empty archive state remained visible. Editor cancelled without changes. |

The sidebar called the demo environment Production despite the persistent DEMO banner. This reflects runtime mode, not the intended data-environment label.

## Changes following inspection

- The dedicated demo entrypoint marks its application state as demo. The existing authenticated `/api/status` returns a separate boolean `demo`; production runtime `app_mode` is preserved. No new public endpoint.
- AppModeContext exposes `isDemo`; the shared sidebar displays DEMO in all four supported languages for that entrypoint. Other environments retain their previous labels.
- Sequence preview uses the existing shared Modal: dialog semantics, initial focus, focus containment, Escape handling and focus restoration. Preview recipient controls have accessible names. Closing and duplicate submission are guarded during a pending test send.
- Demo disables the test-send controls and the Enter handler. Backend demo restrictions remain in place. Preview rendering is still available.
- No schema migrations, version renumbering, branding/license changes or roadmap changes.

## Verification of changed code

- Backend: 41 passed (`tests/test_demo.py`, `tests/test_outbound_safety.py`). Includes independent demo flag vs production runtime cases. Transport in outbound safety tests is mocked.
- Frontend: 131 passed across 15 test files. Added sequence preview dialog/focus restoration and demo send-blocking regressions.
- Frontend production build passed; existing chunk-size warning remains.
- `git diff --check` passed.

Live observations above describe the previously deployed package, not the subsequently changed preview or environment label. These changes require rebuilding the existing demo for live visual acceptance.

## Open gates

Full Dark/Light visual comparison, deployed tablet/mobile layouts, long-content and all modal flows, PostgreSQL upgrade/backup/restore tests and public/private isolation acceptance remain open. This follow-up does not close P0 or declare a stable release.
