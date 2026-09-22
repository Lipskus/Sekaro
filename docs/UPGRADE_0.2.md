# Upgrade to Sekaro 0.2

Sekaro 0.2 changes the active mailbox core to SMTP/IMAP-first and introduces a deployment-level encryption key for mailbox passwords.

## What changes

- new inboxes default to `smtp`
- optional per-inbox `Reply-To`
- SMTP/IMAP passwords are encrypted at rest
- IMAP authentication requires TLS: implicit TLS or STARTTLS
- manual inbox synchronization is available in **Odebrane**
- SMTP threading and IMAP UID checkpoint handling are hardened
- `SEKARO_ENCRYPTION_KEY` is the preferred mailbox encryption key

## Before upgrading

Create a PostgreSQL backup:

```bash
cd /opt/sekaro
mkdir -p backups
docker compose exec -T db pg_dump -U sekaro -d sekaro -Fc > "backups/sekaro-pre-0.2-$(date +%Y%m%d-%H%M%S).dump"
```

Confirm the backup exists and is not empty:

```bash
ls -lh backups/
```

## Configure mailbox encryption

Generate a long random key:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Add it to `.env`:

```env
SEKARO_ENCRYPTION_KEY=<generated value>
```

Do not change this key after mailboxes are configured unless you intentionally rotate it through Sekaro's migration path.

### Existing installations

If an earlier Sekaro/Quickly installation has a legacy encryption key stored in PostgreSQL, startup with `SEKARO_ENCRYPTION_KEY` will:

1. decrypt existing SMTP/IMAP secrets using the legacy key,
2. re-encrypt them using `SEKARO_ENCRYPTION_KEY`,
3. remove the legacy database-stored encryption key.

This makes possession of the PostgreSQL backup alone insufficient to decrypt mailbox passwords.

If a ciphertext cannot be decrypted with either the requested key or the known legacy key, Sekaro leaves that value untouched and logs an error instead of destroying it.

## Upgrade application

```bash
cd /opt/sekaro
git pull --ff-only
docker compose build app
docker compose up -d app
```

The application startup migration adds the new `inbox.reply_to` column and changes the database default for new inbox providers to `smtp`.

## Verify

```bash
docker compose ps
docker compose logs --tail=150 app
```

Open the Sekaro panel and check **Stan systemu**. The **Szyfrowanie haseł skrzynek** check should report that the encryption key is separated from PostgreSQL.

Then open **Skrzynki** and verify:

- SMTP host / port
- SMTP username
- SMTP TLS mode
- IMAP host / port
- IMAP username
- IMAP TLS mode
- Reply-To, if needed

Use **Testuj połączenie** before sending production messages.

Finally open **Odebrane** and use **Synchronizuj** to verify IMAP synchronization.

## Rollback

Application code can be rolled back with Git, but a database restored from a pre-0.2 backup also contains the old encryption-key state. Treat the database backup and its corresponding application configuration as a pair.

Never restore only an old database and then discard the encryption key that was active when that backup was created.
