# Public endpoint and mailbox operations

This guide covers the public endpoint and mailbox connections in Sekaro 1.0.
Existing installations retain their behavior until an administrator explicitly
connects the new configuration. **Installation does not automatically switch DNS
or migrate an older Beacon service.**

## Interface changes

In Mailboxes, **Add mailbox** offers SMTP/IMAP, Gmail, or Microsoft 365.
OAuth connections are available to administrators. Gmail requires account selection
and consent; Microsoft 365 requires account selection. Connecting an account does
not automatically start campaigns. The **Public endpoint** section shows the mode,
connection, event queue, and retained older endpoints without exposing keys.

## Application mode and installation role

| Mode | Public features | Campaigns |
|---|---|---|
| `private` | No new public links | No tracking or unsubscribe header; `{{unsubscribe_link}}` is rejected during preflight and before sending |
| `unsubscribe` | Unsubscribe links | No tracking; body link and optional header |
| `tracking` | Unsubscribes, opens, clicks | Tracking options selected per campaign |
| No configuration file | Existing behavior | Upgrades preserve the legacy configuration |

Switching to private mode does not remove global suppression. Keep older endpoints
in the configuration with `retired: true`; they continue to synchronize and are
checked before sending to contacts for whom they previously issued links.

The installer's three roles determine which services run on a particular server:

```bash
# New private Sekaro installation without public links:
python3 scripts/sekaro-install.py install --role private

# New Sekaro installation and isolated endpoint on the same server:
python3 scripts/sekaro-install.py install --role combined \
  --public-url https://links.example.org --endpoint-mode unsubscribe

# Endpoint only on a second server; does not create a Sekaro database or secrets:
python3 scripts/sekaro-install.py endpoint-install --sync-bind 10.20.0.2
```

`10.20.0.2` must belong to the endpoint server's intended LAN/VPN interface.
The combined role binds the API to the Docker bridge gateway address by default;
use `--sync-bind` to override it. Both standalone ports bind to `127.0.0.1` by
default: 5051 serves public links and 5052 serves the separate API. The public
listener behind a local proxy stays on loopback. Do not use `0.0.0.0` simply to
work around a connection failure.

The installer does not configure DNS, proxies, tunnels, or firewalls. The default
192 MiB and 0.5 CPU are container limits, not verified capacity requirements.
The endpoint has a separate volume and internal Docker network, runs as UID 10001
without capabilities, and has no access to the database volume, Sekaro secrets,
or Docker socket. Verify firewall rules and actual isolation from host services
on the deployed server.

## Connecting an existing Sekaro installation

Securely transfer `.sekaro-endpoint/client.key` from the endpoint host to the
private Sekaro host. Do not put the key in a URL or a command recorded in shell
history. Create a private `endpoint-connection.json` file with mode 0600, for example:

```json
{
  "mode": "unsubscribe",
  "endpoints": [{
    "id": "primary",
    "transport": "mesh",
    "public_url": "https://links.example.org",
    "sync_url": "http://10.20.0.2:5052",
    "key_file": "/root/sekaro-endpoint-client.key",
    "inbox_ids": []
  }]
}
```

```bash
python3 scripts/sekaro-install.py endpoint-connect --config endpoint-connection.json
python3 scripts/sekaro-install.py update
python3 scripts/sekaro-install.py status
```

Pairing verifies authorization, protocol, and endpoint database identity, then
writes private files. The update mounts them only into the application. The
contact identifier secret is generated on the Sekaro host; the endpoint receives
an HMAC identifier, not an email address. `inbox_ids: []` defines the default
profile. You can specify mailbox IDs, and one endpoint can serve multiple mailboxes.
Profiles cannot have overlapping lists or two default assignments. Each endpoint
database is associated with one profile.

For synchronization over the Internet, use `https://` and restrict access to the
Sekaro machine. In addition to the application key, you can provide:

- `access_id_file` and `access_secret_file`: Cloudflare Access Service Auth;
- `ca_file`: a custom certificate authority;
- `cert_file` and `cert_key_file`: an mTLS client certificate and key.

These are local file paths used before pairing. HTTP is allowed only with an
explicit `local`, `mesh`, or `lan` transport; the transport name itself provides
neither encryption nor access control. The client does not use environment proxy
settings or HTTP redirects. Mark the old profile `retired: true` instead of deleting
it after moving mailboxes.

## Proxy configuration and server checks

Route the public hostname only to port 5051. It serves `/o/{token}`, `/c/{token}`,
`/u/{token}`, and a neutral `/` page. Never route it to port 5052 or private Sekaro.
An unsubscribe GET displays a confirmation; POST persists the unsubscribe.
Automated GET link scanning does not unsubscribe recipients.

Expose API port 5052 only to the Sekaro source/identity. For a tunnel, use separate
public and Service Auth hostnames. A public IP requires TLS and an appropriate
allowlist. Verify IPv4, IPv6, and Docker published-port rules separately.
`internal: true` alone does not control access to host services.

Before enabling campaigns, check the actual deployment topology:

1. From an external client, confirm public links work without Access login or
   CAPTCHA, `/v1/status` on the public host returns 404, and the private panel is hidden.
2. Confirm API access is denied from unauthorized sources and with a missing or
   incorrect key. Keep TLS, certificate, and Service Auth verification enabled.
3. Send a controlled test email: open/click it, confirm unsubscribe, and verify
   persistence in Sekaro. Restarting the endpoint must not allow sending again.
4. Simulate an API outage: dependent sends must stop while an independent endpoint
   continues to work.
5. From the endpoint container, verify no access to the database, panel, or other
   private services. Also check host ports and mesh routes.

Code and local tests do not replace these network checks. The panel reports
connection and continuity results, not a security certification of the topology.

## Migrating existing links

Pause campaigns. Back up the Sekaro database, endpoint volume, and configuration.
Drain pending events from the old service. After connecting the new endpoint, run
this in the application container with its configuration:

```bash
python -m app.endpoint_client migrate-existing
```

The importer copies existing unsubscribe tokens and log mappings, including older
short open tokens. It is safe to rerun. **It does not drain pending events from an
external Beacon service.** Preserve old domains, certificates, and `/o`, `/c`, `/u`
paths. Redirect them to the new public listener only after importing and verifying.
The importer neither repairs DNS nor recovers lost unsubscribes.

## Operations and recovery

```bash
python3 scripts/sekaro-install.py endpoint-status
python3 scripts/sekaro-install.py endpoint-backup
python3 scripts/sekaro-install.py endpoint-update
python3 scripts/sekaro-install.py endpoint-rotate
# Transfer the new client.key, then repeat endpoint-connect + update on Sekaro.
# Revoke only after verifying the new key:
python3 scripts/sekaro-install.py endpoint-revoke-old
```

Rotation retains the previous key until explicitly revoked. Complete one rotation
before starting another. Backups use the SQLite backup API, include WAL state, and
are stored in `.sekaro-endpoint/backups`. Also securely back up
`.sekaro-endpoint/env`, `server.keys`, `.sekaro-install/endpoint-client`, and `.env`
separately. A database backup without the private HMAC key/configuration is not
sufficient for full recovery.

```bash
python3 scripts/sekaro-install.py endpoint-restore --backup-file /root/endpoint.sqlite3
# Only when the current volume is unavailable and cannot be backed up:
python3 scripts/sekaro-install.py endpoint-restore --backup-file /root/endpoint.sqlite3 --skip-current-backup
```

Restore requires paused campaigns and a compatibility review of both backups.
A fresh endpoint database has a different identity and blocks sending; gaps or
stale endpoint/Sekaro state also block sending. Restoring an older backup can lose
unsubscribes that never reached Sekaro. Cursors alone cannot prove or recover those
missing events. Do not clear the cursor or pair a new empty endpoint to suppress
an error. Recover the complete durable state and reconcile suppression before resuming.

## Protocol semantics and limitations

Version 1 supports mapping registration, status, batches of up to 250 events,
cursor acknowledgment, and suppression checks. No callback to Sekaro is needed.
Event effects and the cursor are stored in the same transaction; ACK follows
commit. Replays after a lost ACK do not double-count statistics. Before creating
a message log, the application drains the queue, then checks recipient suppression
again immediately before sending. There is no atomic transaction spanning the
endpoint and SMTP: an unsubscribe after the final check can race with a message
already being handed to the provider.

Opens and clicks are counted once per token, not once per visit. At 100,000 pending
tracking events, new tracking events are dropped while unsubscribes continue to
be retained. Repeated requests for the same token do not grow the queue. A full
disk returns an error, not a false unsubscribe confirmation. ACK removes processed
events. Mappings, suppression records, and deduplication markers remain so old
links keep working; monitor storage and maintain backups. Configure Internet
request limits on the proxy. The endpoint does not store token-bearing access
logs, recipient IP addresses, or User-Agent values. Click target URLs can contain
personal data and remain in mappings; account for this in the installation's
retention policy.
