# Sekaro delivery plan

The operator approved **11 substantial stages** on 29 September 2026. Stage numbers describe execution order, not semantic versions. The scope and sequence remain unchanged. Up to two splits of large stages were reserved only if a concrete need was demonstrated.

This English overview is the current entry point. The complete dated development record is preserved in [the original Polish delivery log](RELEASE_EXECUTION_HISTORY_PL.md), including historical test results, constraints, approvals and links to QA evidence. That log records the state at each date, not a single current status.

## Working rules

- A functional package may contain multiple commits and PRs. Individual buttons do not require separate releases.
- Compare existing code with the approved scope before each package; preserve and extend working features.
- Refactoring belongs to the package it supports. Do not build a parallel CRM or second interface.
- An acceptance candidate includes its branch, exact commit, test results, limitations and update command for the existing installation. Do not create a second demo.
- Merge and agent-operated deployment require authorization. The operator authorized integration into `main` on 6 October; that authorization does not mean the server was deployed or acceptance completed.
- Sending tests use mocks or isolated local transport, without actual messages or invitations.

## Stages and acceptance boundaries

| Stage | Scope | Dependencies and acceptance |
|---|---|---|
| 1 — P0 | Existing UI, sending protection, light/dark, forms, keyboard, responsiveness, localization, sequence and inbox regressions | Evidence across views/states; mocked transport; explicit deviations from design references and unresolved gaps |
| 2 — contacts and history | Archive/restore the existing Lead, archive view, status and independent sending blocks, actor/time history | Preserve IDs, logs and replies. Archived contacts cannot receive future sends; restoring does not remove suppression or trigger mail |
| 3 — outreach analytics | Existing report validation, agreed missing reports and mailbox/domain diagnostics | Define metrics and sources; distinguish missing measurements from positive results |
| 4 — operational foundation | PostgreSQL upgrade, backup/restore, security, isolated public unsubscribe and operational documentation | Existing-installation upgrade, restored-data checks and private/public boundary; separate decision before stable 1.0 |
| 5 — CRM core (P1–P3) | Same Lead as person, multiple addresses, companies/relationships, history, notes and safe merging | Extend stage 2 and preserve campaign/log/reply/suppression links. Company links and person merges remain separate operations |
| 6 — sales (P4–P5) | Opportunities, pipeline, tasks, meetings and CRM calendar | Full opportunity lifecycle; outcome independent of CRM/sending state; CRM calendar does not replace campaign scheduling |
| 7 — automations and reports (P6a–b) | Shared CRM/outreach rules and CRM reporting | Stages 5–6; durable definitions/execution history, explicit triggers, repeats/errors, suppression and audit |
| 8 — users (P7a–b) | Accounts, teams, roles, permissions, audit and calendar details before editing | Extend existing auth/authorship; enforce API and UI access, not just hidden buttons |
| 9 — adapters and Gmail (P8a–b) | Shared adapter contract, existing SMTP/IMAP, diagnostics and Gmail API | Preserve `keep/immediate/days` and SMTP EML; verify connection, sending, receiving and failures |
| 10 — Microsoft 365 (P8c) | Graph connection, optional per-mailbox footer and S/MIME | Stage 9 contract; consent/refresh/sync/error handling; mailbox connection is separate from Sekaro login |
| 11 — installer (P9) | Installation/update, diagnostics, optional antivirus, S3/SFTP/FTPS backups, README/docs, favicon and final UI review | Repeatable installation, safe updates, verified backup/recovery and provider trials; full visual/control acceptance |

## Current checkpoint — 6 October 2026

| Stage | Recorded status |
|---|---|
| 1 | P0 package `8f5c7b4` installed by the operator. Dashboard, contacts and templates observed after login on 4 October. Continuing the plan did not imply pixel-perfect acceptance; documented deviations remain. |
| 2 | Deployed and accepted on demo on 4 October: archive, restore, actor/time history and retained blocks. See [QA](qa/2026-10-04-stage2-contacts.md). |
| 3 | Deployed on 4 October; campaign/mailbox/country reporting and Domains observed. CSV download remained unverified by the browser tool; operator directed continuation. See [QA](qa/2026-10-04-stage3-analytics.md). |
| 4 | Demo acceptance on 4 October: operator verified PG15→17, restored data and container isolation. Panel and 60 contacts observed. Production public-domain/TLS configuration and stable 1.0 remain separate. |
| 5 | Functional demo acceptance on 5 October: company, two people, relationships, addresses, notes and merge preserving IDs/history; desktop light/dark checked. See [QA limitations](qa/2026-10-04-stage5-crm.md). |
| 6 | Deployed; basic demo acceptance on 5 October for pipeline, opportunity/win, task/reminder/completion and calendar meeting; desktop light/dark checked. See [QA](qa/2026-10-05-stage6-sales.md). |
| 7 | Deployed; main approval/automatic-rule paths, history, limits and CRM reports accepted on 5 October after CRM/group navigation cleanup. See [QA](qa/2026-10-05-stage7-automation-reports.md). |
| 8 | Implemented; administrator panel and calendar details→edit observed on demo. Live limited-account and complete visual acceptance remain separate. See [access guide](STAGE_8_ACCESS.md). |
| 9 | Implemented; mocked OAuth/adapter tests passed. Real Google consent, refresh and synchronization require target-account validation. See [Gmail guide](STAGE_9_GMAIL.md). |
| 10 | Implemented; 609 backend tests passed/9 skipped, 272 frontend tests passed and build passed. Synthetic S/MIME integrity independently verified with OpenSSL. Real Microsoft/provider/certificate acceptance remains open. See [mail guide](STAGE_10_MAIL.md). |
| 11 | Implemented and integrated through PR #38. Local tests: 633 backend passed/9 skipped, 280 frontend passed, build passed. Integration CI passed. Fresh install/update, remote providers, new recovery paths, real ClamAV and complete UI review remain open. See [release gates](STAGE_11_RELEASE.md). |

## Decisions before stable 1.0

1. Confirm the required outreach reporting/domain measurement scope.
2. Confirm the private/public route matrix. The target core remains application, PostgreSQL and isolated unsubscribe. Additional public endpoints need a decision.
3. Accept supported languages and documented deviations from inconsistent older mockups. Do not claim complete localization or pixel-perfect matching without evidence.
4. Confirm the supported upgrade matrix and PostgreSQL backup/recovery evidence.
5. Agree release numbering. UI label `0.5.6` is not a deployed commit identifier.

CRM order from PR #37 remains preserved; this document does not merge that PR or replace `ROADMAP.md`. Additional sets of 38/72 or 490 mockups were not approved. Normal installations must not simulate unimplemented modules with fabricated records.

## Approved additions kept within existing stages

**Stage 8:** clicking a calendar task/meeting opens a read-only details window. Only the separate Edit action opens the revision-aware form, subject to permissions.

**Stage 10:** footers and personal S/MIME signing are independent options, disabled by default. Sign the final MIME; enabled signing fails closed on certificate errors. Encrypt private keys/passwords. Do not promise bypassing spam filters.

**Stage 11:** installer documentation, genuine screenshots, S3/SFTP/explicit FTPS backups with encryption, schedule, retention, connection test and transfer history; preserve local copies on transfer failures. Plain FTP is not included. Replace the favicon and inspect every module, form, detail/edit dialog and control across light/dark, PL/EN/DE/RU and desktop/tablet/mobile. Check spacing, wrapping, focus, state changes, save/reload, cancellation and unsaved-change behavior. Builds/component tests alone do not complete visual acceptance.

## Integration and documentation

The operator authorized the combined merge and repository cleanup on 6 October. PR #38 integrated stages 1–11 and removed generated n8n build output and an unused logo. QA evidence, historical migrations and compatible configuration were preserved. PR #39 updated Sekaro presentation and retained license notices. English operator documentation and genuine English-selected demo screenshots follow as documentation work, without an additional product stage or server deployment.
