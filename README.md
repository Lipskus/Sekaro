# Sekaro

**Sekaro** is a self-hosted outreach and email correspondence platform focused on ordinary **SMTP + IMAP mailboxes**, controlled campaign scheduling, a unified inbox, contact history, reporting, and safe suppression handling.

Sekaro is being developed as a provider-agnostic tool. Google Workspace and Microsoft 365 OAuth are not required to log in to the application or to use the core mailbox workflow.

> Current development line: **0.1.x**. The project is usable for development and early testing, but the feature set is still being reshaped around the Sekaro roadmap.

## Goals

Sekaro is intended for workflows where contacts come from spreadsheets or external datasets and outreach should remain fully under the operator's control:

- CSV/XLSX contact imports with custom fields
- plain-text and HTML messages
- SMTP sending
- IMAP reply synchronization
- configurable sending limits and timing
- multi-step sequences and follow-ups
- stop-on-reply / bounce / unsubscribe
- unified inbox and threaded correspondence
- global deduplication and suppression
- campaign and geographic analytics
- SPF, DKIM, DMARC and domain-health diagnostics
- self-hosted deployment with private administration access

See [ROADMAP.md](ROADMAP.md) for the version plan.

## Current 0.1 foundation

The current Sekaro fork includes:

- local administrator registration using **email + password**
- login using email or username
- bcrypt password hashing and JWT sessions
- PostgreSQL storage
- SMTP/IMAP mailbox flow as the primary mailbox type
- encrypted SMTP/IMAP passwords at rest when `SEKARO_ENCRYPTION_KEY` is set
- optional per-inbox Reply-To address
- IMAP over implicit TLS or STARTTLS only
- existing campaign, queue, contacts, analytics and inbox foundations inherited from the upstream project
- Polish, English, German and Russian translation infrastructure
- Polish as the default UI language
- Docker-based deployment
- local-only application binding by default

Some legacy provider-specific code from upstream still exists internally while the refactor is in progress, but Google/Microsoft app-login and mailbox OAuth routes are no longer part of the active 0.1 application flow.

## Production-style Docker deployment

Requirements:

- Linux host
- Docker Engine
- Docker Compose v2
- approximately 1–2 GB RAM for a small installation
- PostgreSQL storage on SSD

Clone the repository:

```bash
git clone https://github.com/Lipskus/Sekaro.git
cd Sekaro
```

Create the environment file:

```bash
cp .env.example .env
```

Generate secrets:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
openssl rand -hex 32
```

Put the generated values into `.env`:

```env
BASE_URL=https://sekaro.example.com
CORS_ORIGINS=https://sekaro.example.com

QUICKLY_SECRET_KEY=<generated JWT secret>
SEKARO_ENCRYPTION_KEY=<generated mailbox encryption secret>
POSTGRES_PASSWORD=<generated database password>

SEKARO_PORT=5050
```

Start Sekaro:

```bash
mkdir -p backups
docker compose -f docker-compose.sekaro.yml up -d --build
```

The application is intentionally published only on:

```text
127.0.0.1:5050
```

Use a reverse proxy, VPN, or a Cloudflare Tunnel/Zero Trust setup to provide HTTPS access. Do **not** expose the administrative port directly to the Internet.

On the first visit, Sekaro asks you to create the first local administrator account. Public registration closes after the first account is created.

## Architecture

The 0.1 deployment contains:

```text
sekaro-app
    |
    +--- FastAPI backend
    +--- React frontend
    +--- scheduler
    +--- SMTP/IMAP integration
    |
sekaro-db
    |
    +--- PostgreSQL
```

A separate minimal public unsubscribe service is planned before the stable release so the administration panel can remain private while recipients can always opt out.

## Updating a source-built installation

```bash
git pull --ff-only
docker compose -f docker-compose.sekaro.yml build --pull app
docker compose -f docker-compose.sekaro.yml up -d
```

Always keep a current database backup before upgrading production data.

## Languages

Sekaro's UI infrastructure currently supports:

- Polish
- English
- German
- Russian

Translation coverage will expand as screens are refactored. Polish is currently the default language.

## Project origin

Sekaro started as a fork of **Quickly**, an MIT-licensed self-hosted cold-email project by its upstream contributors. The fork retains the MIT license and relevant upstream history while its architecture and product direction are being refactored for Sekaro's SMTP/IMAP-first use case.

## License

MIT — see [LICENSE](LICENSE).
