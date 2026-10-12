# Contacts, companies and CRM

Feature documentation for Sekaro 1.0.

## Model and migration

- A person remains an existing `Lead`. Campaign, message, reply and unsubscribe-token IDs are not reassigned.
- CRM profiles distinguish unspecified contacts, people and shared mailboxes. Existing records remain unspecified until the operator classifies them. An address such as `info@` is not automatically treated as a person.
- `Lead.email` remains the sending address and appears in CRM alongside additional addresses from `contact_address`. Additional addresses support record keeping and search; they do not redirect existing campaigns to another recipient.
- Companies have their own identity, description, domain, archive state and actor/timestamp history. Company–contact relationships are many-to-many and include a role/job title. Companies can exist without people, and contacts without companies. Archiving a company does not change its contacts' sending state.
- A one-time migration copies explicit values from `company`, `firma`, `Company` and `Firma` fields into companies and relationships. Each source record creates a separate company for review: an identical name or domain is not proof of identity. Old fields remain available to templates. To consolidate duplicate companies, link contacts to the chosen company, remove redundant relationships and archive the remaining companies.
- The migration has its own marker and PostgreSQL transaction lock. Subsequent starts do not recreate deleted relationships or overwrite edited companies. Later imports use the existing importer and FieldManager; operators assign new relationships in CRM without automatic company-name matching.
- Notes are appended with the session actor and timestamp; the client cannot replace their attribution. They are persistent entries rather than an editable history field.

## Merging and sending safeguards

1. Set both records to the Person type. In the retained contact's profile, open CRM, find the other record and select Compare.
2. Choose the source value for conflicting names and custom fields. Empty fields are filled. The preview includes both records' IDs and addresses.
3. Confirm the merge. The server rereads and locks the records, compares the preview fingerprint and rejects stale decisions.
4. The source is archived and points to the retained contact. The source and its correspondence remain in place. The retained contact's CRM shows combined addresses, companies, notes, operations and links to the original records' history. Campaigns and messages keep their source IDs.
5. Both records' campaign enrollments are paused. Unexecuted slots are removed; uncertain send attempts and their slots remain. Restoring the source or deleting either merged record is blocked. Imports do not overwrite the merged source.
6. Blocks remain effective: unsubscribe/suppression during merging covers the person's known addresses. A later unsubscribe on the old record also blocks sending to the retained person through the shared pre-transport check. Existing suppression metadata and uncertain attempts are not overwritten.

Merging is permanent; the interface cannot split records again. A single person can be the source of another merge, and an existing merged group can be its target. Alias chains are not allowed. The audit entry includes selected values and both contacts' previous data.

## Private interface

Companies appear in navigation, with a CRM tab in the existing contact profile. Screens use the shared Shell, Modal, confirmations, fields and error handling, with PL/EN/DE/RU labels. `/api/crm/*` requires authentication. Demo permits local CRM operations while retaining transport blocks. The public unsubscribe service receives no additional routes or access to CRM tables.

## Validation and updates

See [installation](INSTALLATION.md) and [release validation](RELEASE_1.0.md).
