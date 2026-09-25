# Campaign setup continuation — 2026-09-25

Status: functional six-stage setup implemented; rendered reference acceptance OPEN.

## Previously deployed fixes verified
Browser inspection of index-B7LD4CkX.js confirmed PR17 changes: campaign table 1053 px wide within its 1053 px container (formerly 1192), mailbox names/email stacked, dashboard active count 3, contact activity timestamps visible, period reply rate 40% (10/25), warning/error notification tones, dark campaign zebra rows and template-history grid. No send actions performed; theme restored to System.

## References and implementation
Full-size references 015 (creation), 067 Dark and 068 Light (preflight) informed this change. Shared palette follows the final reference series.

- New campaign starts with name and six-stage navigation/checklist. Next persists exactly one paused campaign and opens Contacts. Failure retains the entered name; repeated clicks while pending do not create duplicates.
- Contacts and Sequence reuse the existing operational editors. Basics reopens campaign settings. No unsupported description, goal, tag, or predicted-reply fields are fabricated.
- Dedicated mailbox selection and schedule steps support Save and next, retain the current stage on errors, and reject empty/invalid sending windows. Existing editor steps retain their own save controls; the footer explicitly instructs saving before navigating.
- Final summary uses a two-column checklist/summary layout. Seven groups cover SMTP, sequence, recipients, variables, calendar, limits and uncertain queue attempts. Unknown future issue codes remain visible in an additional group.
- Start is unavailable with missing/failed/blocking diagnostics and always rechecks readiness before calling the existing start endpoint. Backend validation remains authoritative. No automatic skipping of contacts is introduced: missing variable values remain blocking as required by the API.
- Normal campaign overview gains an entry back into setup and explicit schedule/limit diagnostic rows.
- Purple sequence action text/background/borders use the matching theme tokens to fix the observed low contrast.

## Validation / limits
39 component tests and production build pass; diff whitespace check passes. New regression cases exercise duplicate creation, failed creation, missing/blocked diagnostics, unknown diagnostics, failed mailbox save, invalid schedule, successful save-before-navigation and a blocker appearing immediately before start.

New screens are not yet rendered on the VPS. Post-deployment desktop/mobile Dark/Light checks remain necessary. Contacts/sequence/settings editors still use their existing markup and do not yet have full PNG geometry parity; recipient side panels, queue/activity composition and the other areas in the master audit remain open. This change does not complete all campaign or all 98-board QA.
