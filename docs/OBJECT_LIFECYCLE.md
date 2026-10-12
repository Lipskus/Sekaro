# Object lifecycle review — 11 October 2026

This review covers the existing Sekaro objects. Archive preserves identity and
history. Removing a relationship must not delete either related object.

| Object | Appropriate operation | Current implementation / decision |
| --- | --- | --- |
| Contacts | Archive and restore; delete unused records | Archive is available. Permanent deletion is blocked for message history, notes, sales records, tags and merged identities. |
| Companies | Archive and restore | Existing CRM archive preserves contact and sales relations. |
| Contact groups | Delete group or remove membership | New group deletion action uses the existing endpoint; contacts and campaign recipients remain intact. No separate archive needed for this grouping container. |
| Campaigns | Archive and restore; delete unused drafts | New archive pauses sending and preserves all records. Restore stays paused. Campaigns with message history cannot be deleted. Deleting an unused campaign never deletes its contacts. |
| Campaign recipients | Pause or end enrollment | Preserve delivery history; use existing enrollment controls, rather than deleting the contact. |
| Sequence steps and A/B variants | Edit/remove campaign configuration | Existing controls; do not treat these as independently archived business records. Sent content/history must remain separate from future configuration. |
| Personalized message overrides | Clear or replace draft content | Existing per-recipient editor; no separate archive. |
| Templates | Delete reusable definition | Existing deletion; sent messages are separate records. Deletion also removes template versions, so confirm it. |
| Pipelines | Archive and restore | Existing editor archive. Used stage keys cannot be removed. |
| Pipeline stages | Rename/reorder; remove unused stage | Existing server guard rejects removing stages referenced by opportunities. |
| Opportunities | Archive and restore | Existing editor and archive filter; original contact/company identities remain. |
| Tasks and meetings | Complete or cancel | Existing status filter retains history. No physical deletion action is added. |
| Automation rules | Disable / re-enable | Existing switch retains definition, proposals, runs and audit. No destructive removal of execution history. |
| Tags | Retain audit provenance | Tags produced by automation remain attached in this package; a general tag-management UI is not introduced. |
| Additional contact addresses | Remove secondary association | Existing removal endpoint; preserve primary identity and delivery/suppression records. |
| Notes | Retain history | Append-only CRM notes; no destructive deletion added. |
| Custom fields | Delete definition; explicit purge only when requested | Existing field manager separates removing a definition from purging stored values. |
| Mailboxes | Pause; remove configuration deliberately | Existing controls. Pausing is preferred for a mailbox with useful conversation history. |
| Users | Deactivate / revoke access | Preserve actor attribution and audit; use existing access management. |
| Roles and teams | Remove only after reassigning dependencies | Current UI supports editing and removing memberships. Keep role/team definitions for now; no permanent-delete endpoint is added. |
| API keys | Revoke | Existing revocation; never archive an active credential. |
| Webhooks | Disable or delete configuration | Existing integration controls. |
| Suppression entries | Retain by default; explicit removal | Removing an entry can allow sending again. This is not a routine archive operation. |
| Saved views | Replace/delete preference | Presentation configuration, not business history; do not apply business-record retention rules. |

## This release

- Adds campaign archive/restore and the archive list filter.
- Prevents campaign deletion from removing contacts.
- Blocks campaign/contact deletion when message history would be destroyed.
- Blocks campaign/contact deletion while a durable send claim is unresolved.
  Queue recalculation preserves claimed slots and does not schedule replacements
  for the affected enrollment, including after campaign archive/restore.
- Adds confirmed group deletion with CRM write permissions.
- Resolves meeting contact, company and opportunity names in the paginated API,
  including archived original relations, without rewriting their IDs.
- Repairs provider-card and domain-diagnostic spacing, with stacked provider
  cards below 900px and wrapping domain inputs below 640px.
- Sizes campaign archive/restore buttons to their text, preventing overlap with
  the duplicate/delete actions.

## Verification

Regression tests cover history preservation, paused restoration, unresolved send
claims and group deletion. Responsive fixture checks cover desktop, tablet and
phone layouts. See [release validation](RELEASE_1.0.md) for deployment limits.
