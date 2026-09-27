# Templates workspace and deployed archive check — 2026-09-27

## Deployed archive check

The live demo at service.marinakeeper.com loads the archive section introduced by PR #28. Its deployed stylesheet is `index-qzo7SCW4.css`; the new storage controls and API data were observed directly. The generic version label remains 0.5.6 and is not a commit identifier.

Verified in the authenticated browser at 1353 × 929:

- Light and Dark renders, readable fields and diagnostics, no page-wide horizontal overflow.
- Keep originals is selected. Choosing a deletion policy without confirmation leaves its save button disabled. Closing a dirty editor opens the discard dialog.
- Archive count is zero, expected for this demo with live transport blocked. No deletion policy was saved, no connection credentials changed, and no real message was sent or removed.
- Restored the original System theme preference after the theme checks. Screenshots are in `evidence-2026-09-27/archive-{light,dark}.jpg`.

The editor is taller than this viewport and scrolls normally. Its mailbox list scrolls horizontally when the side panel is open. Populated archive download/removal states remain covered by automated tests, not a live demonstration against a real mailbox.

## Templates findings and batch

Compared the existing editor and contact preview with full-size reference boards 037/038 and 039/040, both themes. The original live editor silently discarded a changed subject when another template was selected. Preview retained the template list and insertion controls instead of the reference's contact and resolved-value panels.

Changes:

- Editor: aligned list/editor/history columns, clear panel headings, version marker, bounded scrolling, wrapping long text, token-based Light/Dark controls and Quill toolbar, responsive stacking.
- Preview: contact search/details on the left, rendered message in the center, actual substituted values and test-send controls on the right. No invented delivery or usage metrics.
- Draft confirmation for template/version/new and normal in-app link navigation; unload protection; disabled editing while a save/send is pending; duplicate-save/send guards; errors retain drafts.
- Duplicate creates an unsaved copy of current content. Historical versions remain immutable; saving their content creates a new version.
- Search has loading, empty and error states and ignores stale responses. Preview clears on content/contact changes and ignores late results. Rich-text controls unmount while previewing, preventing hidden editor controls leaking into the accessibility tree.
- Name/content/version are saved atomically in one endpoint request. Version numbering is serialized per template on PostgreSQL.

Local verification: 88 frontend tests, including eight new workflow regressions; template backend tests include atomic name/content updates and duplicate-name rejection without partial writes. Production build and the configured backend suite are run before publication; CI is required before merge.

Not claimed complete: new-template rendering after deployment, mobile/tablet screenshot acceptance, category/usage statistics and editable preview-only contact overrides from the mockups. The current backend does not supply those reference capabilities. No full 98-board parity claim.
