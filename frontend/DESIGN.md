# Sekaro frontend design guide

This document describes the current Sekaro UI after the 0.5.x redesign consolidation. New screens and edits should extend this system rather than recreating the legacy Quickly/Tailwind presentation.

## Source of truth

- Visual references are indexed in `design/ui-mockups/INDEX.md`.
- Global theme and shell tokens live in `src/redesign/design.css`.
- Shared spacing, radius, responsive and per-surface bridge rules live in `src/redesign/tokens.css`.
- Shared redesign primitives live in `src/redesign/ui.jsx`.
- Authenticated routes render inside `src/redesign/Shell.jsx`.

Do not use old collages or superseded screenshots as implementation references.

## Theme

Sekaro uses a native light/dark theme. Dark Reader is not part of the runtime.

- `DarkModeContext` stores `light`, `dark` or `system` in `sekaro.theme`.
- `public/darkmode-init.js` applies the theme before first paint.
- The root receives `html.sekaro-ui`, `.dark` when appropriate, and `data-theme="light|dark"`.
- New CSS should use `--sk-*` tokens instead of hard-coded light-only colors.
- Tailwind `dark:` utilities may remain in migrated functional screens, but new redesign code should prefer the Sekaro tokens.

## Core layout

The authenticated application consists of:

- fixed responsive sidebar: `.sk-sidebar`
- sticky top bar: `.sk-topbar`
- content workspace: `.sk-main`
- standard redesign route wrapper: `PageFrame` / `.sk-page-frame`

Use `PageFrame` for new route-level screens unless the screen already uses a purpose-built redesign layout such as Dashboard, Contacts, Inbox or Campaign Workspace.

Page content must keep `min-width:0` where it participates in flex/grid layouts. Tables and intentionally wide data surfaces must scroll horizontally instead of clipping the viewport.

## Shared primitives

Prefer components from `src/redesign/ui.jsx`:

- `Button`
- `Badge`
- `Panel`
- `Metric`
- `PageFrame`
- `SectionTabs`
- `Field`
- `Switch`
- `StatePanel`
- `ErrorNotice`
- `Empty`

Large pre-redesign workflows may still use `components/ui/*`. Those components are compatibility surfaces and are normalized by `sk-legacy-*` bridge styles. Do not introduce new one-off card/button systems.

## Spacing and sizing

Use the canonical tokens from `tokens.css`:

- spacing: `--sk-space-1` through `--sk-space-10`
- radii: `--sk-radius-sm` through `--sk-radius-xl`
- controls: `--sk-control-h`, `--sk-control-h-sm`
- page width: `--sk-page-max`

Avoid arbitrary margins and fixed widths when an existing token or responsive pattern exists.

## Semantic colors

Use the semantic Sekaro palette:

- primary/accent: `--sk-primary`, `--sk-accent`
- success: `--sk-green-soft`, `--sk-green-text`, `--sk-success`
- warning: `--sk-amber-soft`, `--sk-amber-text`, `--sk-warning`
- destructive: `--sk-red-soft`, `--sk-red-text`, `--sk-danger`
- information: `--sk-blue-soft`, `--sk-blue`, `--sk-info`
- neutral surfaces/text: `--sk-bg`, `--sk-surface`, `--sk-surface-alt`, `--sk-text`, `--sk-muted`, `--sk-line`

Never use obsolete variables such as `--muted`, `--success` or `--info`.

## Responsive behavior

The shell switches to the mobile drawer layout at 760px. Surface-specific breakpoints in `tokens.css` generally use 760px, 900px, 1180px or 1300px.

Required behavior:

1. no page-level horizontal clipping
2. navigation remains reachable on mobile
3. actions wrap rather than overflow
4. modals remain within the viewport and their bodies scroll vertically
5. wide tables/queues use controlled horizontal scrolling
6. metric grids reduce columns progressively
7. drawers and detail panes become mobile-safe views

Do not restore global `overflow-x:hidden` as a workaround for an overflowing component. Fix the component or provide an intentional scroll container.

## States

Every data surface should provide the states that apply to it:

- loading
- empty
- error with retry where meaningful
- success/confirmation
- disabled / unavailable
- destructive confirmation
- modal/drawer state

Use `StatePanel`, `ErrorNotice`, `Empty`, the global notification provider and the shared confirmation modal instead of browser `alert()` or silent console-only failures.

A missing health/diagnostic response must never be presented as a healthy state.

## Accessibility

- keep one clear route-level `h1`
- preserve `:focus-visible` treatment
- label icon-only buttons
- keep modal focus trapping and Escape handling
- expose loading/error/status messages with appropriate ARIA roles
- respect `prefers-reduced-motion`
- do not communicate warning/error/success by color alone

## Legacy bridge policy

The following are compatibility mechanisms, not patterns for new code:

- `.sk-legacy-card`
- `.sk-legacy-button`
- `.sk-legacy-campaign`
- scoped selectors that normalize old Tailwind gray/background classes

When touching an old workflow, prefer moving the changed surface to redesign primitives. Keep bridge CSS only where a full functional migration would add unnecessary risk.

## QA before merging UI changes

Check at minimum:

1. Light, Dark and System theme
2. desktop, tablet and narrow mobile widths
3. long names, long e-mail addresses and empty values
4. loading, empty and API error paths
5. destructive confirmations and disabled controls
6. tables, drawers, popovers, modals and toasts for clipping
7. keyboard focus and Escape behavior
8. no reintroduction of Quickly branding, Dark Reader, obsolete CSS variables or light-only surfaces
