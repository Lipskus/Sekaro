"""Separate entrypoint: normal UI/API, synthetic DB, no scheduler or mail transport."""
import os
import re
import smtplib
import imaplib
from contextlib import asynccontextmanager

from sqlalchemy.engine import make_url
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

BANNER = '''<style id="sekaro-demo-style">
body{padding-top:30px!important}.sk-topbar,.sk-sidebar{top:30px!important}
#sekaro-demo-banner{position:fixed;inset:0 0 auto;z-index:99999;height:30px;display:flex;align-items:center;justify-content:center;background:#684b00;color:#fff;font:600 12px system-ui;text-align:center;padding:0 8px}
</style><aside id="sekaro-demo-banner" role="status">DEMO · fikcyjne dane · wysyłka i synchronizacja zablokowane</aside>'''


def validate_demo_target(raw_url):
    if os.environ.get("SEKARO_DEMO_MODE") != "1" or os.environ.get("TEST_DATABASE_URL"):
        raise RuntimeError("Demo requires SEKARO_DEMO_MODE=1 and no TEST_DATABASE_URL override")
    url = make_url(raw_url)
    if (url.get_backend_name(), url.host, url.database, url.username) != (
        "postgresql", "demo-db", "sekaro_demo", "sekaro_demo"
    ):
        raise RuntimeError("Demo requires its dedicated demo-db/sekaro_demo database and user")


def deny_transport(*args, **kwargs):
    raise RuntimeError("DEMO: SMTP and IMAP connections are disabled")


def block_mail_transports():
    # SMTP_SSL inherits SMTP.connect; IMAP4_SSL uses IMAP4.open.
    smtplib.SMTP.connect = deny_transport
    imaplib.IMAP4.open = deny_transport


def allowed_request(method, path):
    """Fail closed for network/integration actions; retain ordinary local CRUD."""
    if path.startswith(("/oauth", "/mcp", "/api/mcp")):
        return False
    if re.search(r"/(?:[^/]*(?:send-test|test-send|send-email|verify|verification-start|detect-provider|sync|beacon|connect-url|authorize)[^/]*)(?:/|$)", path):
        return False
    if method in {"GET", "HEAD", "OPTIONS"}:
        return True
    if path in {"/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/auth/change-password"}:
        return True
    if method == "POST" and re.fullmatch(r"/api/unibox/threads/[^/]+/mark-read", path):
        return True
    return bool(re.fullmatch(r"/api/(?:leads|contact-fields|contact-lists|campaigns|inboxes|templates|notifications|ui/contacts)(?:/.*)?", path))


class DemoMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method == "GET" and request.url.path == "/api/demo/status":
            return JSONResponse({"demo": True, "sending_enabled": False, "scheduler_enabled": False})
        if not allowed_request(request.method, request.url.path):
            return JSONResponse({"detail": "Ta operacja jest zablokowana w DEMO. Wysyłka i integracje są wyłączone."}, status_code=403)
        response = await call_next(request)
        if response.status_code == 200 and response.headers.get("content-type", "").startswith("text/html"):
            content = b"".join([part async for part in response.body_iterator])
            content = content.replace(b"<body>", ("<body>" + BANNER).encode(), 1)
            headers = dict(response.headers)
            headers.pop("content-length", None)
            headers["cache-control"] = "no-store"
            return Response(content, status_code=response.status_code, headers=headers, background=response.background)
        return response


@asynccontextmanager
async def demo_lifespan(app):
    from app.database import init_db, AsyncSessionLocal
    from app.demo.seed import seed_demo
    await init_db()
    async with AsyncSessionLocal() as db:
        async with db.begin():
            # Serialize first seed if two processes are inadvertently launched.
            from sqlalchemy import text
            await db.execute(text("SELECT pg_advisory_xact_lock(73620260925)"))
            app.state.demo_dataset = await seed_demo(db, os.environ.get("DEMO_ADMIN_PASSWORD", ""))
    # Intentionally no scheduler, IMAP, MCP or backup jobs from the normal lifespan.
    yield


def create_app():
    validate_demo_target(os.environ.get("DATABASE_URL", ""))
    block_mail_transports()
    from app.main import app
    app.router.lifespan_context = demo_lifespan
    app.add_middleware(DemoMiddleware)

    return app
