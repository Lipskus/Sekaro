# Sekaro 1.0.0

Release scope agreed on 12 October 2026. This is the consolidated code release;
publishing it and updating a running server are separate actions.

## Included

Contacts, companies and groups; CRM history and sales pipeline; tasks, meetings
and calendar; auditable automations and reports; email campaigns and scheduling;
SMTP/IMAP plus optional Gmail/Microsoft 365; mail identities and S/MIME; local
conversation Archive/Trash; users, roles and audit; private installation, public
endpoint pairing and event synchronization; encrypted local/remote backups.
The interface supports Polish, English, German and Russian, with light/dark themes.

## Release preparation

- Version 1.0.0 is shown in the interface and application API metadata.
- Historical QA images/logs, delivery work logs, old landing-page assets and
  upstream-image publishing workflows are excluded from the clean source tree.
- Runtime code, automated tests, migrations, installers and required notices remain.
- Existing database identifiers, Compose production/demo projects and volumes,
  environment aliases, API integration identifiers and `.qbk` backups are preserved.
- The old source is preserved separately; it is not included in the new main history.

## Validation

Validation during release preparation:

- Backend: **661 passed, 9 skipped** (environment-dependent checks).
- Frontend: **285 passed** across 34 test files.
- Production frontend build: passed; existing bundle-size advisory remains.
- Responsive fixture views: **18 captures, no failures**, 390/768/1600 px, both themes.
- Local documentation links and source version consistency checked.

These checks use test data; they do not send production mail or deploy the release.
A timezone-dependent schedule test fixture was corrected to use the current instant,
so its message remains on the current local calendar day.

## Deployment limits

The version number does not turn an untested external setup into a verified one.
Validate the integrations you enable against your installation:

- Fresh Docker installation/update and running commit label on the target host.
- Public endpoint network isolation, IPv4/IPv6 firewall/proxy rules and pairing.
- Actual S3/SFTP/FTPS transfer, retention, interruption and recovery using test data.
- PostgreSQL restore into an isolated database, with the original encryption keys.
- Real ClamAV daemon/signature readiness when antivirus is enabled.
- Gmail/Microsoft OAuth and SMTP delivery using the operator's test accounts.

The preparation environment has no Docker daemon. Local tests cannot replace
these host/provider checks. Existing demo checks and earlier PostgreSQL CI runs
are useful evidence for those configurations, not for every deployment scenario.

## Installing

After the `v1.0.0` tag is published, follow [INSTALLATION.md](INSTALLATION.md).
Keep private administration behind your trusted access gateway. New installations
default to private mode; [public endpoint configuration](PUBLIC_ENDPOINT_OPERATIONS.md)
is optional and explicit. Preserve `.env`, installation state and database volumes
when replacing the source repository.
