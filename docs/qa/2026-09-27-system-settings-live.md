# System settings: live QA follow-up

Inspected deployed `e881c90` through Cloudflare Access at service.marinakeeper.com, using the existing demo account. This is a focused follow-up, not completion of the 98-board audit.

## Findings fixed

- Scheduling radio inputs measured 348.5 px wide instead of 15 px. The shared campaign card selector applied `width:100%` to radio controls, overflowing the choice cards in both themes. Exclude radios alongside checkboxes.
- Category buttons inherited centered flex alignment. Align icons and labels to the start and allow long labels to wrap.
- The 30 px demo banner was absent from viewport-height calculations. At a 936 px viewport the save bar ended at 966 px; clicking Save scrolled the body and clipped the settings heading. Expose the banner height as a CSS variable and subtract it from shell, root, main and settings heights. Production uses a zero fallback; mobile settings retain natural height.
- Translate remaining English primary actions/status labels in email verification and the AI enable label.

## Live checks on the previously deployed build

- All 11 production categories opened in Light/System and Dark: General, Appearance, Account, Known IPs, Backup/restore, AI, Email verification, Other, API keys, Webhooks and MCP.
- DOM width measurements found overflowing scheduling cards in both themes; no other content overflow at the available desktop viewport, excluding the deliberately visually hidden file input.
- Dark theme saved successfully. Cancel discarded a pending switch to System. System preference was restored and saved after QA.
- Search without Polish diacritics (`wyglad`) returned Appearance. No-result feedback and clearing search worked.
- No sending, integration tests, keys, webhooks, backups or restore actions were triggered.

## Validation and remaining acceptance

Local frontend production build and existing component regression suite pass. PR CI must pass before merge.

The live browser still serves the previous deployment. Recheck corrected radio dimensions, left alignment and the fully visible save bar after the VPS rebuild. Mobile and pixel-level comparison against every PNG remain open. The custom-provider verification wizard still contains legacy English explanatory text; this patch only translates its common actions/statuses.
