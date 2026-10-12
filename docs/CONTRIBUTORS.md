# Developing Sekaro

Sekaro uses Python 3.12, FastAPI, async SQLAlchemy and PostgreSQL, with a React 18
frontend built using Node.js 22 and Vite. Production and demo installation are
covered in [INSTALLATION.md](INSTALLATION.md).

## Local development

```bash
git clone https://github.com/Lipskus/Sekaro.git
cd Sekaro
cp .env.example .env
# Set POSTGRES_PASSWORD, QUICKLY_SECRET_KEY and SEKARO_ENCRYPTION_KEY.
# Set BASE_URL=http://localhost:5173 for the development frontend.
docker compose -f docker-compose.dev.yml up --build
```

The frontend listens on localhost:5173, backend on localhost:8000 and development
PostgreSQL on localhost:5434. The development database has its own Compose volume;
never connect development to a production database. Mail providers may send real
messages in development mode: use test mailboxes or the separate demo mode.

## Tests

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pip install pytest pytest-asyncio aiosmtpd
cd frontend
npm ci
npm test
npm run build
cd ..
python -m pytest -q
```

The default backend suite uses SQLite. PostgreSQL-specific tests require a
separate disposable database and their documented environment variables; tests
can create and drop tables. Do not supply production database credentials.
CI also exercises Docker networking and PostgreSQL archive recovery.

`scripts/check-p0-ui.cjs` checks responsive screens with API fixtures and writes
to ignored `artifacts/ui/`. Set `P0_PLAYWRIGHT_MODULE`, `P0_CHROMIUM` and optionally
`P0_UI_OUTPUT` to your local tools/output paths. Fixture checks do not establish
provider connectivity or production deployment health.

## Source layout

- `app/`: authenticated private application, scheduler, adapters and migrations.
- `frontend/`: active React interface, translations and UI regression tests.
- `public_endpoint/`: isolated public tracking/unsubscribe service.
- `public_unsubscribe/`: compatibility service for existing installations.
- `scripts/`: installer, diagnostics and maintenance tools.
- `tests/`, `smoke_test/`: regression tests and queue validation utilities.
- `n8n-node/`: integration with stable historical node identifiers.

Create a feature branch and keep changes scoped. Preserve identifiers, database
migration paths, durable send claims, suppression and backup compatibility.
Update relevant tests and documentation. Application versions live in
`app/version.py` and `frontend/package.json` (including its lockfile).

Keep secrets, generated builds, test captures and database dumps out of Git.
All contributions remain under the [MIT license](../LICENSE).
