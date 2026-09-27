# Campaign recipients — boards 019/020

## Live findings

Confirmed the deployed settings fixes: both scheduling radios measure 15 px, navigation uses flex-start, and the save bar ends at viewport bottom (936 px). Native radio appearance additionally needs restoring so the selected dot is visible.

Inspected DEMO · Mariny Bałtyk on the existing demo instance. Compared recipient layout with Light 019 and Dark 020 PNG references. The inline add form displaced the table, filters occupied multiple rows, custom fields widened the table, and there was no search or pagination. Duplicate reply badges and English action labels remained.

## Changes

- Four summary cards use actual campaign-recipient data (total contacts, replies, content needed, bounced/unsubscribed). No invented suppression/list/segment statistics.
- Move add forms into an accessible right drawer. Retain drafts on close; preserve CSV import, preview and confirmation. The preview now uses the shared accessible modal, with no simultaneous focus traps.
- Add accent-insensitive search over email, name and custom values, compact collapsible filters, custom-column selection and 10/25/50/100-row pagination. Clamp pages when refreshed data shrinks.
- Export the complete filtered in-memory result, not only its current page or visible columns. The campaign leads API returns all enrolled leads. Include all custom fields, quote CSV cells, add UTF-8 BOM and neutralize spreadsheet formulas. The prior export request omitted open/click/reply/unverified filters.
- Fix verification button passing a click event as truthy `forceReverify`; explicit confirmation is again required to reverify existing results.
- Remove duplicate badges; translate sending/removal/stage labels; respect duplicate/verification options for single-contact addition and report the returned added count.
- Restore native radio appearance and account for the demo banner above the drawer.

## Validation

Production build and 57 frontend tests pass, including six recipient cases for pagination, draft preservation, combined filters/export, CSV quoting/formulas, verification confirmation and column toggles. Full PR CI is required before merge.

## Remaining acceptance

The browser still serves the previous recipient build. Inspect the new drawer, table and filters in Light/Dark and mobile after deployment. This is not a claim of 1:1 parity with all 98 boards. Reference list/segment selection and bulk removal have not been implemented in this patch.

Sequence board 017 was compared with the live editor: current narrow step navigation and read-only detail panel differ from the reference's wider timeline plus side editor. A dedicated sequence pass remains next; no campaign content or sending state was changed during this inspection.
