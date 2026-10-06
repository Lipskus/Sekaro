"""Only /u/{opaque_token}; restricted database function, no admin or mail secrets."""
import os
import re
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse


@asynccontextmanager
async def lifespan(app):
    app.state.pool = await asyncpg.create_pool(os.environ["UNSUBSCRIBE_DATABASE_URL"],
                                              min_size=1, max_size=3, command_timeout=10)
    try:
        yield
    finally:
        await app.state.pool.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def headers(request, call_next):
    response = await call_next(request)
    response.headers.update({"Cache-Control":"no-store", "Referrer-Policy":"no-referrer",
                             "X-Content-Type-Options":"nosniff", "X-Frame-Options":"DENY",
                             "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"})
    return response


def page(message, status=200):
    return HTMLResponse('<!doctype html><html lang="pl"><meta charset="utf-8">'
                        '<meta name="viewport" content="width=device-width,initial-scale=1">'
                        '<title>Sekaro · Rezygnacja</title><body><main><h1>Rezygnacja z wiadomości</h1>'
                        '<p>'+message+'</p></main></body></html>', status_code=status)


@app.api_route("/u/{token}", methods=["GET", "POST"], include_in_schema=False)
async def unsubscribe(token: str, request: Request):
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", token):
        return page("Link jest nieprawidłowy.", 404)
    try:
        async with request.app.state.pool.acquire() as connection:
            # A single database transaction; only a boolean leaves the database.
            valid = await connection.fetchval("SELECT sekaro_public.unsubscribe($1)", token)
    except (asyncpg.PostgresError, TimeoutError, OSError):
        return page("Nie udało się zapisać rezygnacji. Spróbuj ponownie później.", 503)
    return page("Rezygnacja została zapisana. Nie otrzymasz kolejnych wiadomości.") if valid else page("Link jest nieprawidłowy.", 404)
