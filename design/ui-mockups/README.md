# Sekaro UI reference mockups

This branch stores the approved visual reference set for the Sekaro UI consolidation.

## Scope

- 48 reference boards in Dark Mode
- 48 matching reference boards in Light Mode
- 2 optional/final System Health references
- Total: 98 PNG references

Existing redesigned screens that are not counted again:
- application shell / sidebar / top bar
- Login
- Dashboard
- main Contacts screen
- Campaign Overview
- Inbox / Wątki
- Domains

## Rules

1. Dark and Light references are paired 1:1.
2. A planned feature that is not implemented yet stays visible but disabled and is marked `Wkrótce`.
3. Reference PNGs define layout, hierarchy, components and product states. Small spacing/line-height corrections are allowed during implementation.
4. Do not treat old collages, failed renders or superseded drafts as implementation references.
5. State boards cover empty/loading/error/success/disabled/destructive/modal states without requiring separate application routes.

## Structure

```
design/ui-mockups/
  INDEX.md
  README.md
  png/
    dark/
    light/
    system-health/
```

PNG assets are tracked with Git LFS to keep repository history manageable.
