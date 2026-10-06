# Stage 10 — Microsoft 365, email footers and S/MIME

Three features in one package. Connecting Microsoft is separate from signing in to Sekaro. Email footers and S/MIME signing are independent, optional and disabled by default for each mailbox. A certificate is not required for ordinary email use.

## Microsoft 365 / Outlook

1. Register an application in Microsoft Entra with the **Web** platform and redirect URI `https://YOUR-DOMAIN/api/office365/callback`. Select supported account types appropriate to your organization and configure a client secret.
2. Delegated Microsoft Graph permissions are `Mail.ReadWrite`, `Mail.Send` and `User.Read`, with offline access. Your organization may require administrator consent. Application-wide access to every tenant mailbox is not used.
3. Configure the application container environment:

   ```dotenv
   BASE_URL=https://YOUR-DOMAIN
   OFFICE365_CLIENT_ID=your-application-id
   OFFICE365_CLIENT_SECRET=your-application-secret
   OFFICE365_TENANT_ID=your-tenant-id
   SEKARO_ENCRYPTION_KEY=existing-persistent-installation-key
   ```

   Multi-organization/personal-account applications may use `common` if their registration permits it. Do not replace an existing encryption key. Recreate the container through the installation workflow after environment changes; a restart alone does not update its environment.
4. As a Sekaro administrator, open **Inboxes → Microsoft 365 → Connect Microsoft 365**. Select the account, grant consent and return to the panel.
5. New mailboxes start with sending paused. Configure limits and review assignments before resuming. Reconnect requires the same account and preserves history, limits and paused state. Existing SMTP/Gmail mailboxes are not converted.

The callback stays behind the private access gateway, such as Cloudflare Access. Do not expose the old `/oauth/office365/callback`. All new connection routes require a signed-in administrator. Single-use state expires after 10 minutes and is bound to the administrator and installation configuration; the flow uses PKCE S256. If the session expires, sign in and restart the operation.

Tokens are encrypted. With a configured key, startup also encrypts legacy Microsoft tokens, as it does for Gmail. Missing keys block new connections. Status does not expose tokens; it shows accounts, scopes, token expiry and last synchronization.

Synchronization reuses the existing Microsoft Graph mirror, Inbox/SentItems/JunkEmail folders and delta checkpoints. Messages and checkpoints are committed together so an interrupted fetch does not skip remaining messages. Replies use `createReply` with complete MIME, then send the draft, without undocumented `/$value` replacement.

## Optional email footer

Open the footer/S/MIME section when editing a mailbox. Enter plain text and, optionally, a formatted version. The editor supports basic formatting and links, without active content or embedded images. Enable automatic footer inclusion and save.

The footer is added during shared MIME assembly for campaigns, replies and tests. It does not modify saved templates or replace unsubscribe links. Schedule preview uses its assigned mailbox; campaign preview shows the first assigned mailbox's footer and address, matching the mailbox used by campaign testing. Footers can differ across mailboxes. Replies have an expandable preview including the footer. Configuration saved after preview still applies to later sending.

## Optional S/MIME digital signature

1. Prepare a personal S/MIME certificate and private key in P12/PFX format, with its password. Do not share the key in chat or commit it to the repository.
2. In the footer/S/MIME section, select the file (maximum 250 KB) and enter its password. Import requires server-side encryption configuration.
3. The certificate must contain the sender's address, be within its validity period, permit email protection and use RSA 2048+ or EC 256+. A CA certificate is not accepted as a personal certificate.
4. Enable S/MIME signing, save and verify a message in the recipient's email client. A certificate can be stored while signing is disabled.
5. To remove the certificate, disable signing and select removal when saving. Disabling the footer does not disable S/MIME, or vice versa.

P12/PFX data and its password are encrypted in the database and are never returned to the browser by the API. Audit records contain toggle changes and certificate replacement/removal events, without keys or passwords. Retain the installation encryption key for database recovery.

The signature covers the final MIME body and attachments after message, footer and tracking preparation. External transport headers are not covered. This is not message encryption for the recipient. When S/MIME is enabled, a missing, expired, mismatched or unreadable certificate blocks sending; there is no silent unsigned fallback.

Import validates the address, key, dates and certificate usage locally. It does not establish issuer trust on the recipient's computer or check CRL/OCSP status. The administrator is responsible for obtaining and replacing a certificate from an appropriate trusted issuer. The recipient verifies it in their email client. Provider-added footers or other changes after the message leaves Sekaro can invalidate the signature. S/MIME does not guarantee avoidance of spam filtering; SPF/DKIM/DMARC remain separate domain configuration.

## Testing and acceptance

The stage 10 full suite passed **609 backend tests, with 9 skipped, and 272 frontend tests**. A further 15/15 OAuth tests passed after the callback privacy-header correction. The production build passed with the existing bundle-size warning.

S/MIME was independently checked using `openssl smime -verify`: plain text, HTML, final Gmail/Microsoft MIME and detection of modified content. Test certificates are synthetic; `-noverify` isolates signature integrity from issuer trust. Integration tests use SQLite and mocked external servers. No real messages were sent and no user-owned private certificate was used.

Target-account acceptance remains required for Entra consent, token refresh, actual synchronization and recipient-side verification after the message passes through the provider. Demo still blocks real sending and OAuth connections. SQLite tests do not replace PostgreSQL concurrency trials.

References: [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [createReply MIME](https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0), [sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [cryptography PKCS7](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/serialization/).
