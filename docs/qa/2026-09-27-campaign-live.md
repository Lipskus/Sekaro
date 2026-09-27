# Deployed campaign sequence and analytics QA — 2026-09-27

A full browser reload confirmed the PR24/PR25 UI on service.marinakeeper.com. Earlier same-document hash navigation had retained the old bundle; that was not reliable deployment evidence.

Live desktop inspection (1363×936) covered the sequence overview, edit form, dirty-change dialog and analytics in Light and Dark. Confirmed cancelling step navigation retains a typed draft; explicit discard switches steps. The test draft was not saved. Theme was temporarily set to Dark through Settings, then restored to the original System preference.

Analytics loaded real demo results (7 days: 12 sent, 2 replies, 7 opens, 5 clicks). Loading shows unavailable counters, and lifetime scope labels are visible. Daily table and variant ranking contain data. Sequence and analytics do not cause horizontal document overflow (document width 1353px).

Found and corrected:
- Analytics metrics inherited the dashboard's 173px minimum height, unlike the compact reference cards. Added scoped 108px minimum and side icons, with smaller-screen wrapping.
- Chart lines were too thin in Dark. Use 2.5px strokes and theme accent/blue for the default visible series.
- “Dodaj wariant” compressed into two lines. Let its heading group wrap while retaining the button width.
- Built-in variant name “Default” leaked into Polish analytics. Render the null-ID built-in variant as “Domyślny”; retain user-defined names.

Validation: production build; existing frontend regression suite. These are low-impact presentation corrections, with no new implementation-mirroring tests.

Still pending: rendered after-fix confirmation, mobile/tablet viewports, CSV browser download, and remaining 98-board QA. The browser date-input fill changed the native value but did not commit the React change; live invalid-date validation is not counted as passed (covered by prior component tests). No mail was sent and no campaign data was saved.
