# Sales

Feature documentation for Sekaro 1.0.

## Scope

- Sales navigation includes a pipeline board, opportunity list, tasks/meetings and monthly calendar. Links from company and CRM profiles filter data to that identity.
- Configurable pipelines support names, stage order/names and archive/restore. Stage keys remain stable when renamed or reordered. A stage referenced by an opportunity, including an archived one, cannot be deleted. A fresh installation does not create a sample pipeline; the operator defines the first one.
- Opportunities include name, description, contact/company, stage, amount/currency, probability, expected closing date, open/won/lost outcome, outcome reason and archive/restore. A lost outcome requires a reason. Reopening clears the current closing date while preserving the previous outcome in history.
- Tasks and meetings have relationships, dates, priority, status, an in-app reminder, postponement and a location/link. Follow-up activities can preserve relationships, and selected activities can be completed in bulk. Bulk completion is sequential: it stops on an error and reports the number saved; it is not a single transaction.
- The CRM calendar is separate from campaign scheduling. Queries include the selected month and meetings crossing its boundaries. Weeks start on Monday; narrow screens scroll the calendar horizontally. Forms use the browser timezone; the API requires an offset and stores UTC. A meeting's end is an exclusive boundary.
- Filters and one saved view are stored in the local browser. Lists, boards and calendars use explicit pagination of 100 records; column counts describe the fetched page. The calendar displays this limitation.
- Reminders are in-app indicators, refreshed every minute while the list/calendar is open and the editor is closed. They do not send messages, invitations or system notifications, and do not run when the application is closed.

## Integrity and migration

Four tables are created through the existing `Base.metadata.create_all` at startup: `crm_pipeline`, `crm_opportunity`, `crm_sales_activity` and `crm_sales_event`. They do not rewrite existing columns or IDs. Subsequent starts are idempotent. Full PostgreSQL backups include these tables.

Every write records before/after history, the session actor and timestamp. Updates require the current revision; conflicts return 409 rather than overwriting another user's changes. The interface preserves drafts on errors and blocks repeated submission during saving. History displays the latest 200 entries for a record; older entries remain in the database.

Contact merges do not reassign IDs stored on opportunities and activities. Filtering by the retained person includes members of the merged group and activities associated with their opportunities. New relationships cannot target an archived contact or merged source. Hard deletion of contacts with sales data is blocked; archiving remains available. Opportunity outcomes and activity statuses do not change suppression, campaign pauses or CRM status.

`/api/crm/sales/*` requires authentication and is not exposed by the public unsubscribe service. Module permissions come from roles and teams described in [ACCESS.md](ACCESS.md).

## Validation and updates

See [installation](INSTALLATION.md) and [release validation](RELEASE_1.0.md).
