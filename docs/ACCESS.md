# Users, roles, teams and calendar

## Access scope

Administrators manage accounts, roles and teams in the users and permissions settings. Roles grant read/write access to CRM, campaigns/scheduling, email, reports, templates and automations. Administrators have full access, including configuration, backups, user management and MCP. Ordinary roles cannot grant administrator status.

Permissions apply globally to a module within one installation: **there is no record isolation between teams or multi-tenant boundary**. A user's direct role and team roles contribute permissions cumulatively. The interface explains this scope before changes. Removing a permission from one source does not revoke it if another source still grants it.

Campaigns also require CRM and email read access for related contacts/mailboxes. Automations require CRM read access; changing or executing them also requires CRM write access. Read access includes exporting that module's data. Reports cover the whole installation. Email write access includes mailbox management and sending, subject to existing demo, suppression and preflight checks. Automation definitions are installation-wide rules, not private rules belonging to their author.

New accounts without a role or team have no module access. Existing administrator accounts retain their status. Existing ordinary accounts without a new `UserAccess` record retain access to business modules under the legacy-access mode shown in the UI. Configuration, backups, keys and MCP are administrator-only. The first explicit permissions save replaces that compatibility mode with the administrator's selected role.

## Enforcement and audit

- Each authenticated HTTP request using `get_current_user` checks current database permissions. JWT claims are not the authority for roles. This applies to cookies, Bearer JWT and both API-key forms. Unknown protected routes require an administrator.
- Central checks cover CRM, calendar, contacts/groups, campaigns, email, reports, templates and alternative `/api/ui` routes. Public endpoints have not been expanded.
- MCP requires administrator access because its transport does not pass through each operation's FastAPI dependencies.
- User lists and access history are administrator-only. Audit records include actor, time, before/after values, IDs and permissions, without passwords or keys.
- Accounts are disabled rather than deleted, preserving authorship. Disabling revokes all keys and sets a session-validity cutoff. Re-enabling requires a fresh login. A separate action revokes sessions/keys for an active account.
- Updates require a revision. PostgreSQL serializes access changes with a transactional lock, including the last-administrator check. Users cannot remove their own administrator status or disable their own account.
- The UI restricts navigation/search and module entry, and indicates read-only access. Sales forms and calendar editing respect `crm.write`. Other existing forms may remain visible in read-only mode, but the API rejects writes. UI permissions refresh through `/auth/me`; the API enforces changes on the next request regardless of UI state.

## Calendar

Clicking a task or meeting opens its details: description, type/status, time, location, priority, reminder, snooze and relationships. **Edit** opens the existing revision-aware form. Closing the detail preview does not save or ask to discard changes. The view uses shared style tokens and supports PL/EN/DE/RU.

## Migration

Five additive tables are created through the existing `create_all`: `access_role`, `access_team`, `access_member`, `user_access` and `access_audit`. Existing contacts, users and history are not removed or rewritten. No additional container is required. Full database backups include the new tables. Pre-update tokens continue to work until the administrator revokes the account's sessions. Deployment alone does not change the current demo administrator's permissions.

## Validation

See [release validation](RELEASE_1.0.md). Test the configured provider or access
roles in your own environment before relying on them for production operations.
