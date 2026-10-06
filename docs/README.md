# Sekaro documentation

Self-hosted CRM, sales workflows and email outreach. Start with the installation guide, then configure access, mailboxes and backups for your environment.

## Operator guides

| Guide | What it covers |
|---|---|
| [Installation and maintenance](INSTALLATION.md) | Requirements, fresh installation, first administrator, updates, diagnostics and optional antivirus |
| [Backup and recovery](BACKUPS.md) | Local copies, encrypted S3/SFTP/FTPS transfers, retention, keys and restore procedures |
| [Users, roles and permissions](STAGE_8_ACCESS.md) | Installation-wide access, teams, audit history, account disabling and calendar details |
| [Gmail API](STAGE_9_GMAIL.md) | Private administrator OAuth, reconnection, encryption and troubleshooting |
| [Microsoft 365, footers and S/MIME](STAGE_10_MAIL.md) | Microsoft Graph setup, optional footers and personal signing certificates |
| [Release status](STAGE_11_RELEASE.md) | Implemented features, completed tests and outstanding acceptance gates |
| [Delivery plan](RELEASE_EXECUTION_PLAN.md) | The agreed 11-stage scope and current checkpoints |
| [Interface screenshots](screenshots/README.md) | Genuine demo captures with English selected and their limitations |

## Developer and integration references

The following references predate some Sekaro stages. They remain useful for existing integrations, but may contain historical names or deployment instructions. Use the operator guides above for current installation, access and mailbox configuration. For precise API behavior, inspect the matching application revision.

- [REST API reference](API.md)
- [Webhooks](WEBHOOKS.md)
- [MCP](MCP.md)
- [n8n integration](N8N.md)
- [Contribution guide](CONTRIBUTORS.md)
- [Demo notes](DEMO.md)
- [Legacy installation reference](INSTALL.md) — retained for existing links, including tracking configuration

## Implementation history

Stage notes and `qa/` retain the original development record, including Polish reports, historical screenshots, test fixtures and unresolved findings. They are not a claim that every feature has passed current deployment acceptance.

- [Stage 2: contacts and history](STAGE_2_CONTACTS.md)
- [Stage 3: outreach analytics](STAGE_3_ANALYTICS.md)
- [Stage 4: operational foundation](STAGE_4_OPERATIONS.md)
- [Stage 5: CRM core](STAGE_5_CRM.md)
- [Stage 6: sales](STAGE_6_SALES.md)
- [Stage 7: automation design](STAGE_7_DESIGN.md)
- [Original Polish delivery log](RELEASE_EXECUTION_HISTORY_PL.md)

## Deployment boundaries

Keep the administration panel, login and private API behind your private access gateway. Public unsubscribe uses an isolated service and restricted database role. Demo blocks real sending and external provider connections.

Optional S/MIME signing does not guarantee inbox placement. Remote backup configuration is separate from an actual successful transfer and verified restore. Consult the release status before relying on a feature in production.

## License

See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md). Historical protocol, environment-variable and package names may remain for compatibility.
