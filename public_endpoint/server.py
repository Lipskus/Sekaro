"""Isolated public links and separately bound authenticated synchronization API."""
import base64
import hmac
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field

TOKEN = re.compile(r'^[A-Za-z0-9_-]{11,128}$')
PIXEL = base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL, ack INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS mapping (token TEXT PRIMARY KEY, kind TEXT NOT NULL, subject TEXT NOT NULL, target TEXT, created REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS blocked (subject TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, token TEXT NOT NULL, created REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS observed (token TEXT PRIMARY KEY);
            ''')
            db.execute('INSERT OR IGNORE INTO state(id,epoch) VALUES(1,?)', (secrets.token_urlsafe(32),))

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA synchronous=FULL')
        try:
            with db:
                yield db
        finally:
            db.close()

    def visit(self, token, kind):
        if not TOKEN.fullmatch(token):
            raise HTTPException(404)
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM mapping WHERE token=? AND kind=?', (token, kind)).fetchone()
            if not row:
                raise HTTPException(404)
            if kind == 'unsubscribe':
                db.execute('INSERT OR IGNORE INTO blocked VALUES(?)', (row['subject'],))
            # Unique opens/clicks, coalesced per token: no unbounded scanner events.
            fresh = db.execute('INSERT OR IGNORE INTO observed VALUES(?)', (token,)).rowcount
            if fresh:
                count = db.execute('SELECT count(*) FROM events').fetchone()[0]
                if kind != 'unsubscribe' and count >= int(os.getenv('ENDPOINT_TRACKING_QUEUE_LIMIT', '100000')):
                    db.execute('DELETE FROM observed WHERE token=?', (token,))
                else:
                    db.execute('INSERT INTO events(kind,token,created) VALUES(?,?,?)', (kind, token, time.time()))
            return row['target']


class Item(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(pattern=r'^[A-Za-z0-9_-]{11,128}$')
    kind: str = Field(pattern=r'^(open|click|unsubscribe)$')
    subject: str = Field(pattern=r'^[a-f0-9]{64}$')
    target: str | None = Field(default=None, max_length=4096)


class Registration(BaseModel):
    epoch: str
    items: list[Item] = Field(min_length=1, max_length=250)


class Check(BaseModel):
    epoch: str
    subjects: list[str] = Field(max_length=250)


class Ack(BaseModel):
    epoch: str
    cursor: int = Field(ge=0)


def create_apps(store=None, keys=None):
    store = store or Store(os.getenv('ENDPOINT_DATABASE', '/data/endpoint.sqlite3'))
    def authorized(request: Request):
        configured = keys
        if configured is None:
            configured = Path(os.environ['ENDPOINT_KEYS_FILE']).read_text().splitlines()
        candidate = request.headers.get('Authorization', '').removeprefix('Bearer ')
        if not any(len(key) >= 32 and hmac.compare_digest(candidate, key) for key in configured):
            raise HTTPException(401, 'Unauthorized')

    public = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    sync = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, dependencies=[Depends(authorized)])
    for app in (public, sync):
        @app.middleware('http')
        async def boundary(request, call_next):
            # Read a bounded body before FastAPI's JSON parser.
            total = 0
            async for chunk in request.stream():
                total += len(chunk)
                if total > 1048576:
                    return Response(status_code=413)
                request._body = getattr(request, '_body', b'') + chunk
            try:
                response = await call_next(request)
            except sqlite3.Error:
                return Response('Temporarily unavailable', status_code=503)
            response.headers.update({'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
                'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"})
            return response

    def epoch(db, value):
        if db.execute('SELECT epoch FROM state').fetchone()[0] != value:
            raise HTTPException(409, 'Endpoint state changed; explicit recovery required')

    @public.get('/')
    def root():
        return Response(status_code=204)

    @public.get('/o/{token}')
    def opened(token: str):
        store.visit(token, 'open')
        return Response(PIXEL, media_type='image/gif')

    @public.get('/c/{token}')
    def clicked(token: str):
        return RedirectResponse(store.visit(token, 'click'), status_code=302)

    @public.api_route('/u/{token}', methods=['GET', 'POST'])
    def unsubscribe(token: str, request: Request):
        if request.method == 'GET':
            with store.db() as db:
                if not TOKEN.fullmatch(token) or not db.execute("SELECT 1 FROM mapping WHERE token=? AND kind='unsubscribe'", (token,)).fetchone():
                    raise HTTPException(404)
            return HTMLResponse('<!doctype html><meta charset="utf-8"><title>Sekaro</title><h1>Rezygnacja z wiadomości</h1><form method="post"><button type="submit">Potwierdź rezygnację / Unsubscribe</button></form>')
        store.visit(token, 'unsubscribe')
        return HTMLResponse('<!doctype html><meta charset="utf-8"><title>Sekaro</title><p>Rezygnacja została zapisana. / Unsubscribed.</p>')

    @sync.get('/v1/status')
    def status():
        with store.db() as db:
            return {'protocol':1, **dict(db.execute('SELECT epoch,ack FROM state').fetchone()),
                    'pending':db.execute('SELECT count(*) FROM events').fetchone()[0],
                    'high':(db.execute("SELECT seq FROM sqlite_sequence WHERE name='events'").fetchone() or [0])[0]}

    @sync.post('/v1/register')
    def register(body: Registration):
        with store.db() as db:
            db.execute('BEGIN IMMEDIATE')
            epoch(db, body.epoch)
            for item in body.items:
                if item.kind=='unsubscribe' and len(item.token)<20:
                    raise HTTPException(422, 'Unsubscribe token too short')
                if item.kind == 'click':
                    try:
                        url = urlsplit(item.target or '')
                        _ = url.port
                    except ValueError:
                        raise HTTPException(422, 'Invalid redirect') from None
                    if url.scheme not in ('http','https') or not url.hostname or url.username or url.password or any(ord(c)<32 for c in item.target):
                        raise HTTPException(422, 'Invalid redirect')
                elif item.target is not None:
                    raise HTTPException(422, 'Only click mappings have a target')
                old = db.execute('SELECT kind,subject,target FROM mapping WHERE token=?', (item.token,)).fetchone()
                if old and tuple(old) != (item.kind,item.subject,item.target):
                    raise HTTPException(409, 'Token mapping is immutable')
                db.execute('INSERT OR IGNORE INTO mapping VALUES(?,?,?,?,?)', (item.token,item.kind,item.subject,item.target,time.time()))
        return {'ok':True}

    @sync.get('/v1/events')
    def events(epoch_id: str, after: int = 0):
        with store.db() as db:
            epoch(db, epoch_id)
            ack = db.execute('SELECT ack FROM state').fetchone()[0]
            if after < ack:
                raise HTTPException(409, 'Consumer state is behind acknowledged events; restore required')
            return {'epoch':epoch_id,'events':[dict(r) for r in db.execute('SELECT * FROM events WHERE id>? ORDER BY id LIMIT 250', (after,))]}

    @sync.post('/v1/ack')
    def ack(body: Ack):
        with store.db() as db:
            db.execute('BEGIN IMMEDIATE')
            epoch(db, body.epoch)
            high = db.execute("SELECT seq FROM sqlite_sequence WHERE name='events'").fetchone()
            if body.cursor > (high[0] if high else 0):
                raise HTTPException(409, 'Invalid cursor')
            db.execute('UPDATE state SET ack=max(ack,?)', (body.cursor,))
            db.execute('DELETE FROM events WHERE id<=?', (body.cursor,))
        return {'ok':True}

    @sync.post('/v1/check')
    def check(body: Check):
        with store.db() as db:
            epoch(db, body.epoch)
            return {'blocked':[s for s in body.subjects if db.execute('SELECT 1 FROM blocked WHERE subject=?',(s,)).fetchone()]}

    return public, sync


def public_app():
    return create_apps()[0]


def sync_app():
    return create_apps()[1]
