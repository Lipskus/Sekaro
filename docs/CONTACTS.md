# Contacts and history

Feature documentation for Sekaro 1.0.

## Schema and behavior

- `lead.archived_at`: nullable UTC timestamp; NULL means the contact is not archived.
- `campaign_lead.archive_sending_paused`: persistent pause applied when archiving.
  Resuming a mailbox does not clear it; resuming the specific enrollment explicitly
  (or using the existing recovery operation) is required.
- `contact_operation`: ID, lead_id (FK), action, occurred_at UTC, actor_id
  (nullable user FK), actor_name (persistent name snapshot), details JSON.
  The actor comes exclusively from the authenticated session. Operation history
  does not duplicate EmailLog or LeadReply. Initial events: archive, restore, update.
- PostgreSQL migration is additive and idempotent. Existing records remain
  unarchived; their IDs, enrollments, correspondence and suppression are unchanged.
- Archiving preserves all relationships, pauses existing enrollments and removes
  future slots for which no send attempt has started. Persistent SendAttempt records
  are retained. Archived contacts are excluded by the scheduler and final sender check.
- Restoration changes only archived_at. It does not resume the contact's campaigns,
  remove suppression, reset status/verification or recalculate the queue.
- Lists/exports support current (default), archived and all scopes. Profiles keep
  archive, suppression, verification and campaign status information separate.
- Bulk operations are atomic and lock records in ID order. Repeating archive/restore
  does not create an event unless the state changes.

Archiving cannot recall a message that has already been sent. The sender's final
check locks the contact record until the transaction ends to coordinate with
concurrent archiving.
