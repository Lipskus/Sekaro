# Mailbox editor — 2026-09-27

References: full-size mailbox boards 029/030, Dark/Light. Prior deployed inspection showed a long, narrow form combining credentials, limits, tracking and warmup. This continuation improves the editor; it does not claim to implement all diagnostic/history reference boards.

Changes:
- Five named sections: sender, SMTP/IMAP, limits, warmup and tracking. Drafts remain mounted across section navigation. Associated labels, responsive wrapped section buttons, explicit save status and theme tokens.
- SMTP/IMAP is saved independently; main settings save cannot discard pending credential changes. Both dirty states participate in an accessible discard dialog and Escape handling. Failed saves retain drafts; active saves block duplicate operations and closure.
- Failed credential reads show retry instead of editable empty defaults. Late responses from a previously closed editor are ignored.
- Connection testing uses saved configuration, is unavailable while credential changes remain unsaved, and no longer refreshes over an unrelated general-settings draft. Show test timestamp or explicit absence of a stored result. Expose the existing IMAP SSL setting.
- Invalid fields in another section reveal that section for correction. Standard server validation remains authoritative.

Validation: 74 frontend tests, including five mailbox regressions (cross-section drafts and cancellation; credential load failure/retry; failed general save; test preserving general draft; pending/failed credential save and duplicate guard). Production build passes with the existing chunk-size warning.

Pending: server update and after-change Light/Dark/mobile render verification. No live mail connection tests, credential changes or mail deletion performed. Retention/deletion remains a proposal; current server-retention behavior is unchanged. Separate mailbox health, connection history and sync-history reference boards still need supported data and implementation.
