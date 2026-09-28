# Backend gaps found during final PNG comparison — 2026-09-28

This list separates unsupported data/actions from frontend visual work. The UI must continue to show guidance or an unavailable state rather than invented measurements.

| Reference area | Missing backend capability | Required before matching the reference |
|---|---|---|
| Deliverability 057–058 | Reputation score, blacklist state, DNS measurement history, incidents and trend series | Define sources, refresh cadence, storage model and diagnostic endpoints. |
| Global/campaign analytics 022–023, 032–033, 061–062 | Meeting funnel, deduplicated recipient funnels, segment ranking and several reference ratios | Add event definitions and aggregation endpoints with explicit period/lifetime semantics. |
| Mailbox health 071–078 | Reputation trend, provider connection-test history, IMAP synchronization history and diagnostic log rows | Persist diagnostic/sync runs and expose paginated history APIs. |
| Queue preview 036, 051 | Arbitrary reschedule, mailbox replacement, skip and send-now actions | Add guarded mutation endpoints with audit history and idempotency rules. |
| Notifications 047–050, 091–092 | Quiet hours, digest schedules, per-channel matrix, temporary mute, delivery history and additional channels | Extend notification preferences/schema, scheduler and delivery log API. |
| System health 097–098 | CPU/RAM/disk history, worker/task history, application logs, worker restart and ZIP diagnostic export | Add authenticated observability, retention and privileged action endpoints. |
| Settings/security 006, 008, 087–090 | Complete session/recent-login history and richer backup/restore history | Add session audit and durable operation-history APIs; retain explicit restore staging. |
| Templates 037–040, 059–060 | Category, usage statistics and editable preview-only contact overrides | Add template metadata/usage aggregation and a non-persistent preview override contract. |
| Campaign list/setup 013–021, 063–070 | Owners, tags and some goal/prediction fields shown by references | Define supported campaign metadata before adding controls. |
| Integration dashboards 009, 011, 095–096 | Unified webhook/MCP execution logs and reference-level status history | Persist integration events and expose filtered log/status endpoints. |

Existing backend facts remain authoritative. Missing values must render as unknown/unavailable; zero, success, reputation and delivery guarantees must not be inferred.

