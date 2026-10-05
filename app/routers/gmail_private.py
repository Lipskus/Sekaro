"""Private administrator-owned Gmail consent; no public connection links."""
import json
import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, delete, func
from sqlalchemy.exc import IntegrityError

from app.auth import require_admin
from app.database import get_db
from app.models import GmailAccount, GmailSyncState, Inbox, OAuthState
from app.security import encryption_enabled
from app.settings_manager import settings
from app.access import audit

router = APIRouter(prefix='/api/gmail', tags=['gmail'], dependencies=[Depends(require_admin)])
SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
PURPOSE = 'gmail_private'

class AuthorizeBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    inbox_id: int | None = None


def redirect_uri():
    return settings.base_url.rstrip('/') + '/api/gmail/callback'


def blocked_demo(request):
    return os.getenv('SEKARO_DEMO_MODE') == '1' or getattr(request.app.state, 'is_demo', False)


def configuration():
    parsed = urlparse(redirect_uri())
    return bool(settings.google_client_id and settings.google_client_secret and encryption_enabled()
                and parsed.scheme == 'https' and parsed.hostname and not parsed.username
                and not parsed.query and not parsed.fragment)


def ready(request):
    if blocked_demo(request):
        raise HTTPException(403, 'Gmail connections are disabled in demo')
    if not configuration():
        raise HTTPException(409, 'Configure Google OAuth, HTTPS BASE_URL and SEKARO_ENCRYPTION_KEY first')


@router.get('/status')
async def status(request: Request, db=Depends(get_db)):
    rows = (await db.execute(select(GmailAccount, Inbox, GmailSyncState).join(Inbox, Inbox.id == GmailAccount.inbox_id)
        .outerjoin(GmailSyncState, GmailSyncState.inbox_id == Inbox.id))).all()
    return {'configured': configuration(), 'demo': blocked_demo(request), 'redirect_uri': redirect_uri(),
            'accounts': [{'inbox_id': i.id, 'email': i.email, 'paused': i.paused,
                          'token_expiry': a.token_expiry, 'scopes': a.scopes,
                          'connected': bool(a.refresh_token),
                          'last_sync_at': sync.last_sync_at if sync else None} for a, i, sync in rows]}


@router.post('/authorize')
async def authorize(body: AuthorizeBody, request: Request, db=Depends(get_db), user=Depends(require_admin)):
    ready(request)
    if body.inbox_id is not None:
        inbox = await db.get(Inbox, body.inbox_id)
        if not inbox or inbox.provider != 'gmail':
            raise HTTPException(409, 'Reconnect requires an existing Gmail inbox')
    nonce = secrets.token_urlsafe(32)
    await db.execute(delete(OAuthState).where(OAuthState.purpose == PURPOSE, OAuthState.expires_at < datetime.utcnow()))
    db.add(OAuthState(state_token=nonce, purpose=PURPOSE, expires_at=datetime.utcnow()+timedelta(minutes=10),
                      metadata_json=json.dumps({'actor_id': user.id, 'inbox_id': body.inbox_id, 'redirect_uri': redirect_uri()})))
    await db.commit()
    return {'url': 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode({
        'client_id': settings.google_client_id, 'redirect_uri': redirect_uri(), 'response_type': 'code',
        'scope': SCOPE, 'state': nonce, 'access_type': 'offline', 'prompt': 'consent',
    })}


async def exchange(code, uri):
    """Fixed TLS endpoints; never include provider response bodies in exceptions/logs."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post('https://oauth2.googleapis.com/token', data={
                'client_id': settings.google_client_id, 'client_secret': settings.google_client_secret,
                'code': code, 'redirect_uri': uri, 'grant_type': 'authorization_code'})
            response.raise_for_status()
            tokens = response.json()
            if not tokens.get('access_token') or not tokens.get('refresh_token') or SCOPE not in tokens.get('scope', '').split():
                raise ValueError('Incomplete grant')
            profile = await client.get('https://gmail.googleapis.com/gmail/v1/users/me/profile',
                headers={'Authorization': 'Bearer '+tokens['access_token']})
            profile.raise_for_status()
            email = profile.json().get('emailAddress', '').strip().lower()
            if '@' not in email or len(email) > 255:
                raise ValueError('Missing email')
            tokens['expires_in'] = max(0, min(int(tokens.get('expires_in', 3600)), 86400))
            return tokens, email
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        raise HTTPException(502, 'Google authorization failed. Start a new connection and grant Gmail access.') from None


@router.get('/callback')
async def callback(request: Request, state: str = '', code: str = '', error: str = '', db=Depends(get_db), user=Depends(require_admin)):
    ready(request)
    record = await db.scalar(select(OAuthState).where(OAuthState.state_token == state, OAuthState.purpose == PURPOSE))
    if not record or record.expires_at <= datetime.utcnow():
        raise HTTPException(400, 'Expired or invalid authorization. Start again.')
    metadata = json.loads(record.metadata_json)
    if metadata.get('actor_id') != user.id or metadata.get('redirect_uri') != redirect_uri():
        raise HTTPException(400, 'Authorization belongs to another session or installation')
    # Atomic consumption, committed BEFORE calling Google. Concurrent/replayed callbacks cannot exchange twice.
    consumed = await db.execute(delete(OAuthState).where(OAuthState.id == record.id))
    await db.commit()
    if consumed.rowcount != 1:
        raise HTTPException(400, 'Authorization already used')
    if error or not code:
        return RedirectResponse('/inboxes?gmail=cancelled', status_code=303)
    tokens, email = await exchange(code, metadata['redirect_uri'])
    inbox_id = metadata.get('inbox_id')
    if inbox_id is not None:
        inbox = await db.scalar(select(Inbox).where(Inbox.id == inbox_id).with_for_update())
        if not inbox or inbox.provider != 'gmail' or inbox.email.lower() != email:
            raise HTTPException(409, 'Choose the same Gmail account to reconnect')
    else:
        if await db.scalar(select(Inbox.id).where(func.lower(Inbox.email) == email)):
            raise HTTPException(409, 'Mailbox already exists. Use reconnect for an existing Gmail mailbox.')
        inbox = Inbox(email=email, display_name=email, provider='gmail', paused=True)
        db.add(inbox)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, 'Mailbox already exists') from None
    account = await db.scalar(select(GmailAccount).where(GmailAccount.inbox_id == inbox.id))
    if account is None:
        account = GmailAccount(inbox_id=inbox.id, google_email=email)
        db.add(account)
    account.access_token = tokens['access_token']
    account.refresh_token = tokens['refresh_token']
    account.token_expiry = datetime.utcnow()+timedelta(seconds=tokens['expires_in'])
    account.scopes = tokens['scope']
    audit(db, user, 'mail.gmail.reconnect' if inbox_id else 'mail.gmail.connect', {'inbox_id': inbox.id, 'email': email})
    await db.commit()
    response = RedirectResponse('/inboxes?gmail=connected', status_code=303)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response
