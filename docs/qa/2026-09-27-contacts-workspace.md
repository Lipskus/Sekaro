# Contacts workspace — 2026-09-27

## Evidence and scope

Inspected the deployed populated contact list (60 demo contacts) and contact #60 on PR29. Read full-size reference boards 042/043/044 and the expanded Light activity board 052. The existing profile used generic metrics above two legacy panels; all custom fields were text inputs, and saving converted every custom value to a string, including untouched structured data.

This batch implements the reference's profile/main-column and summary/activity-sidebar composition using actual API data, with Dark/Light tokens, bounded columns, wrapping and responsive stacking. The updated page still needs screenshot acceptance on the private deployment after update. No mobile screenshots or full 98-board parity are claimed.

## Changes

- Profile, Activity, Campaigns and Messages tabs; drafts survive tab switching.
- Profile identity, typed custom fields, saved-variable sidebar and clear save/discard state.
- Preserve untouched numbers, objects and unknown custom keys. Number edits produce numbers; empty values remain explicit instead of silently dropping keys.
- Newest-first timeline merges real interaction events and campaign enrollment dates, with kind and campaign filters. Messages exclude reply markers; summary separates received messages from reply confirmations to avoid counting markers as messages.
- Inline load/save errors, retry, pending-save lock and duplicate-save guard. Route changes clear the old profile and ignore stale loads. Ordinary in-app links and page unload warn about unsaved changes. Browser Back/Forward is not blocked by this BrowserRouter implementation.
- Custom-field filters apply only on Apply; dismissing the dialog leaves the current list unchanged. Bulk actions are disabled while loading or showing failed results. Filtered counts have accurate labels.
- Import locks mapping during commit and prevents duplicate submissions. A successful import followed by a failed list refresh is reported distinctly and cannot be submitted again from the result view.
- Field-definition editing warns before replacing/closing its draft, locks pending operations, and preserves failed drafts. Successful definition writes are distinguished from refresh failures. The toolbar opens the field drawer; its own close control handles draft confirmation.

## Validation

- 96 frontend tests pass, including 8 contact/import/field workflow regressions.
- 7 contact-import backend tests pass.
- Production build passes (existing large-bundle warning).
- Full configured CI gates must pass before merge.

## Remaining reference capabilities

No fabricated contact owners, meetings, notes/tasks/files, global suppression status, per-event open/click/device/location history or unsupported engagement percentages. The current detail API does not supply those reference capabilities. Recovery tools (boards 053–056) and complete mobile/visual acceptance remain open for the final QA pass. This batch does not change mailbox retention or perform any real sending/removal.
