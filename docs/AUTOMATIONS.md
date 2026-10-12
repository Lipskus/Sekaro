# CRM automations and reports

Feature documentation for Sekaro 1.0.

## Behavior shared by both execution modes

- Rule definitions, revisions, enable/pause controls and immutable execution history live in the private CRM.
- Triggers include a reply attributed to a contact/campaign, completion of a contact's campaign enrollment, an opportunity stage/outcome change, an overdue task and meeting creation. Completion of one enrollment is distinct from completion of the entire campaign.
- Actions include creating a task/follow-up, changing a related opportunity's stage and tagging a contact. Owner assignment uses the user and permission model.
- New rules start disabled. Preview shows the event source, target record, planned changes and reasons for skipping. Enabling a rule does not automatically replay all history before activation.
- A database UNIQUE constraint enforces idempotency for `(rule, event)`; effects and success are committed in one transaction. Retrying a failure retains the execution identity; a successful execution cannot run twice.
- Each execution is pinned to an explicit definition revision. Editing a definition does not replace an existing execution's plan. Pausing blocks subsequent executions, including those awaiting approval.
- Automation-generated events do not trigger further rules. Per-run and daily operation limits, error states and manual retries are supported.
- Merged/archived contacts and archived opportunities are rechecked before execution. Invalid targets are explicitly skipped rather than silently reassigned without an audit record.
- These actions do not send mail, add contacts to campaigns, resume sending or remove suppression. Actual transport remains exclusively within the existing outreach engine.
- Demo allows manual event processing to test rules without starting the sending scheduler. Normal installations use the existing scheduler, without a fourth container.

## Execution modes

A. Approval for each execution: the rule creates a proposal; the operator reviews and approves changes. `pending` transitions to `succeeded`, `skipped`, `failed` or `rejected`. This provides control over each event and requires an additional approval.

B. Automatic execution after explicitly enabling the rule: preview is available before activation, then actions run without individual approval. Operators retain pause controls, limits and a full audit trail. This requires less routine work, but a rule can change opportunity stages or create multiple tasks automatically.

Both modes share one model. A is the default; the operator can explicitly select B for a rule.

## Data model

- `crm_automation_rule`: name, enabled state, mode, trigger, conditions/action JSON with closed schemas, revision, activation date and event-source starting point.
- `crm_automation_run`: rule FK with RESTRICT, event key, definition/input snapshots, state, attempt count, planned changes, result, safe error message, approving actor/time and rule–event uniqueness.
- `crm_automation_audit`: persistent history of rule edits, approval/rejection, attempts and outcomes; attribution comes from the session or an explicit system actor.
- Persistent checkpoints prevent lost events or historical replay after restart. Stage/outcome events use SalesEvent; replies use LeadReply. Overdue and enrollment-completion events have deduplicated identity keys and current-state conditions.
- Tags use separate records/contact relationships; they do not overwrite custom fields or represent suppression.
- Migration is additive and preserves campaign, correspondence and contact IDs. Full database backups include the new tables.

## Reports and metric definitions

- Funnel: opportunity count/value by stage; conversion is `won/(won+lost)` with a visible denominator. Open opportunities are not treated as losses.
- Won and open-pipeline values are reported separately for each currency. PLN and EUR are not added together or converted using an unspecified rate. These are opportunity values, not accounting revenue.
- Activities are grouped by type/status/date. Dashboards show overdue work, inactive opportunities and contacts needing follow-up, with explicit inactivity rules and periods.
- Filters cover dates and pipeline, with campaign, mailbox and selected custom-contact-field breakdowns.
- Source attribution uses the latest send before opportunity creation associated with the contact/merged group; the highest ID breaks timestamp ties. One attribution per opportunity prevents double counting. This heuristic is documented, and records without evidence are Unassigned.
- Date ranges identify whether they apply to opportunity creation, closing or activity dates. Complete aggregates are computed server-side, independently of UI pagination.

## Configuration checks

Test preview without mutations, execution in the selected mode, pausing, revision conflicts, retries, duplicate events, checkpoint restart, loop prevention, date boundaries, currencies, source attribution without double counting and suppression before/after execution. Use test data before enabling production rules.
