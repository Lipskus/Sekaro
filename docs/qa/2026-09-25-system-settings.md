# System settings redesign — 2026-09-25

Implements the user's new Dark/Light system-settings concept (not campaign settings).

## Scope
- Replace horizontal tabs and in-page anchors with grouped category navigation and accent-insensitive search.
- Expose General, Appearance/language, Account, Known IPs, Backup/restore, AI, Email verification, Other, API keys, Webhooks, MCP and development-only Test mode.
- Preserve administrator-only backup access and hide the simulation toggle in production. Old hash links map to the matching new categories.
- Apply the new surfaces, spacing, typography, radio tiles, miniature theme previews, responsive navigation and form styles across every section. Scope styles to system settings.
- Keep forms mounted while navigating between categories to retain drafts, including webhook credentials and email-verification configuration.
- Stage scheduler, theme and language changes behind a persistent Save/Cancel bar. Scheduler changes require the existing confirmation when campaigns have contacts. Failures retain drafts; checks fail closed. Other sections retain their own save/test/create operations rather than presenting a misleading global save.
- Preserve backup encryption/restore confirmation, AI connection tests, one-time API key display, webhook tests and MCP configuration.
- Email-verification load failures now show retry rather than editable defaults. Empty AI configurations are shown as empty rather than endlessly loading.

## Verification
Five new component regression cases cover all category navigation and old hashes, search/no-result recovery, role and production visibility, staged scheduling with declined confirmation, and draft preservation through category switches and a failed save.
Production build, component suite, backend/demo regression suite and Docker-network checks are required in PR CI.

## Limits
The execution environment is unavailable, so source edits are made through the repository and validation runs in CI. No browser or VPS execution is available in this turn. Rendered desktop/mobile Dark/Light acceptance remains open until deployment; no pixel-parity claim is made. The generated concept includes account-edit links not supported by the application, so the implementation shows actual session details/logout instead. No production configuration, credentials, backup or message sends were changed during implementation.
