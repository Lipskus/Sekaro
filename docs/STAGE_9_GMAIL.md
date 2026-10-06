# Stage 9 — mail adapters and Gmail API

Sekaro uses a shared adapter boundary for SMTP/IMAP and Gmail sending/synchronization. Unknown mailbox types are rejected even in test mode. Existing Microsoft 365 code was retained for compatibility; its setup and acceptance are covered in [stage 10](STAGE_10_MAIL.md).

## Connect Gmail / Google Workspace

Connecting a mailbox is separate from signing in to Sekaro. A signed-in administrator performs the operation under **Inboxes → Gmail API**. Sekaro reuses the existing synchronization and sending engine. A new mailbox starts with sending paused. Reconnection preserves its ID, history, limits and paused state and requires the same Google account.

1. Select a Google Cloud project, enable **Gmail API**, configure the consent screen and create a **Web application** OAuth client. Add appropriate test accounts if the application is in testing mode. Verification and scope availability depend on publication mode and Google Workspace organization policies.
2. Register the exact redirect URI: `https://YOUR-DOMAIN/api/gmail/callback`. This is a private application route and remains behind the existing access gateway, such as Cloudflare Access. Do not expose the old `/oauth/google/callback` route or public account-connection links.
3. Configure the application container environment:

   ```dotenv
   BASE_URL=https://YOUR-DOMAIN
   GOOGLE_CLIENT_ID=your-google-cloud-client-id
   GOOGLE_CLIENT_SECRET=your-google-cloud-client-secret
   SEKARO_ENCRYPTION_KEY=existing-persistent-installation-key
   ```

   Do not replace an existing encryption key. Store it separately with a secure configuration backup; it is required after database recovery. Keep secrets out of the repository and browser forms. Setting names are listed in `.env.example`. Environment changes require container recreation through the installation workflow; restarting the process does not change an already-created container's environment.
4. As a Sekaro administrator, open Inboxes and choose **Connect Gmail**. Grant consent in Google and return to the mailbox list. This does not send a test message.
5. Verify the mailbox and synchronization in the existing mail view. Resume sending only after setting limits and reviewing campaigns. Connecting does not automatically assign the mailbox to a campaign.

The `gmail.modify` scope supports reading, sending and message labels without permission to permanently delete all mail. Offline access provides a refresh token. Missing required scopes or a refresh token aborts the connection. SMTP/IMAP original-message deletion policies are not extended to Gmail.

## Security and upgrades

- All new `/api/gmail/*` routes, including the callback, require a current administrator session. If it expires, sign in and restart the connection flow.
- Random OAuth state expires after 10 minutes and is bound to the administrator, mailbox and installation address. Configuration stays server-side. State is consumed atomically before code exchange; refreshing a failed callback does not repair it.
- Tokens use Sekaro's existing encryption mechanism. With a configured key, application startup also encrypts legacy plaintext Gmail tokens. The migration is idempotent and preserves data. Without a key, new connections are blocked; existing data is not automatically deleted or changed.
- An existing SMTP mailbox is never silently converted to Gmail. An administrator must resolve a duplicate address; do not delete the mailbox merely to bypass that message.
- Administrator audit history records actor, operation and mailbox ID/address, without tokens. Status exposes configuration, accounts, scopes, token expiry and last synchronization, without credentials.
- Demo blocks Google connections, synchronization and actual sending, and displays that restriction.
- SMTP/IMAP, `keep / immediate / days` retention and existing EML export remain on their existing path. Gmail uses its own thread mirror; this stage does not add full Gmail EML export.

## Troubleshooting

| Symptom | Action |
|---|---|
| Connection button disabled | Check demo mode, administrator permissions, HTTPS `BASE_URL`, both Google settings and the encryption key. |
| Google reports `redirect_uri_mismatch` | Compare the registered URI exactly with `/api/gmail/status`: scheme, domain and path. |
| Consent denied or incomplete scope | Restart and grant Gmail access; check test-account eligibility and Workspace policy. |
| Session expired / state already used | Return to Sekaro, sign in and start Connect Gmail again. |
| Different account selected during reconnect | Repeat with the existing mailbox's address. |
| Consent revoked / refresh token no longer works | Pause the mailbox and reconnect; preserve its history. |
| You want to revoke application access | Pause the mailbox in Sekaro and revoke consent in Google account settings. This stage does not add a remote-revocation button. |

## Acceptance and limitations

Tests use mocked Google services and SQLite. They cover permission boundaries, OAuth state/replay, encryption/migration, reconnect, protection against SMTP conversion, adapter dispatch, Gmail sending, existing mirror synchronization, SMTP archive and demo restrictions. UI tests cover avoiding administrator-configuration requests for ordinary users, demo/configuration restrictions and reconnect errors. Current package totals are recorded in the delivery plan.

Acceptance with a real Google client remains required: consent, token refresh and synchronization of the designated account. No real messages were sent and no PostgreSQL concurrency trial was performed for this stage. Advisory locking and conditional migration updates are implemented; SQLite tests do not replace production-environment validation.

References: [Google OAuth for web applications](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).
