"""Private administrator-owned Office365 consent; no public connection links."""
import json
import base64
import hashlib
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
from app.models import Office365Account, Office365SyncState, Inbox, OAuthState
from app.security import encryption_enabled
from app.settings_manager import settings
from app.access import audit

router = APIRouter(prefix='/api/office365', tags=['office365'], dependencies=[Depends(require_admin)])
SCOPE = 'Mail.ReadWrite Mail.Send User.Read offline_access'
PURPOSE = 'office365_private'

class AuthorizeBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    inbox_id: int | None = None


def authority():
    import re
    tenant = settings.office365_tenant_id or 'common'
    if not re.fullmatch(r'[A-Za-z0-9.-]{1,253}', tenant):
        raise HTTPException(409, 'Invalid Microsoft tenant')
    return 'https://login.microsoftonline.com/' + tenant


def redirect_uri():
    return settings.base_url.rstrip('/') + '/api/office365/callback'


def blocked_demo(request):
    return os.getenv('SEKARO_DEMO_MODE') == '1' or getattr(request.app.state, 'is_demo', False)


def configuration():
    parsed = urlparse(redirect_uri())
    return bool(settings.office365_client_id and settings.office365_client_secret and encryption_enabled()
                and parsed.scheme == 'https' and parsed.hostname and not parsed.username
                and not parsed.query and not parsed.fragment)


def ready(request):
    if blocked_demo(request):
        raise HTTPException(403, 'Office365 connections are disabled in demo')
    if not configuration():
        raise HTTPException(409, 'Configure Microsoft OAuth, HTTPS BASE_URL and SEKARO_ENCRYPTION_KEY first')


@router.get('/status')
async def status(request: Request, db=Depends(get_db)):
    rows = (await db.execute(select(Office365Account, Inbox, Office365SyncState).join(Inbox, Inbox.id == Office365Account.inbox_id)
        .outerjoin(Office365SyncState, Office365SyncState.inbox_id == Inbox.id))).all()
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
        if not inbox or inbox.provider != 'office365':
            raise HTTPException(409, 'Reconnect requires an existing Office365 inbox')
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    authority()
    await db.execute(delete(OAuthState).where(OAuthState.purpose == PURPOSE, OAuthState.expires_at < datetime.utcnow()))
    db.add(OAuthState(state_token=nonce, purpose=PURPOSE, expires_at=datetime.utcnow()+timedelta(minutes=10),
                      metadata_json=json.dumps({'actor_id': user.id, 'inbox_id': body.inbox_id, 'redirect_uri': redirect_uri(), 'verifier':verifier, 'authority':authority()})))
    await db.commit()
    return {'url': authority() + '/oauth2/v2.0/authorize?' + urlencode({
        'client_id': settings.office365_client_id, 'redirect_uri': redirect_uri(), 'response_type': 'code',
        'scope': SCOPE, 'state': nonce, 'response_mode': 'query', 'prompt': 'select_account',
        'code_challenge': base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('='), 'code_challenge_method': 'S256',
    })}


async def exchange(code, uri, verifier):
    """Fixed TLS endpoints; never include provider response bodies in exceptions/logs."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(authority() + '/oauth2/v2.0/token', data={
                'client_id': settings.office365_client_id, 'client_secret': settings.office365_client_secret,
                'code': code, 'redirect_uri': uri, 'grant_type': 'authorization_code', 'code_verifier':verifier, 'scope':SCOPE})
            response.raise_for_status()
            tokens = response.json()
            if not tokens.get('access_token') or not tokens.get('refresh_token') or not {'Mail.ReadWrite','Mail.Send','User.Read'} <= {s.removeprefix('https://graph.microsoft.com/') for s in tokens.get('scope','').split()}:
                raise ValueError('Incomplete grant')
            profile = await client.get('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
                headers={'Authorization': 'Bearer '+tokens['access_token']})
            profile.raise_for_status()
            email = (profile.json().get('mail') or profile.json().get('userPrincipalName') or '').strip().lower()
            if '@' not in email or len(email) > 255:
                raise ValueError('Missing email')
            tokens['expires_in'] = max(0, min(int(tokens.get('expires_in', 3600)), 86400))
            return tokens, email
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        raise HTTPException(502, 'Microsoft authorization failed. Start a new connection and grant Office365 access.') from None


@router.get('/callback')
async def callback(request: Request, state: str = '', code: str = '', error: str = '', db=Depends(get_db), user=Depends(require_admin)):
    ready(request)
    record = await db.scalar(select(OAuthState).where(OAuthState.state_token == state, OAuthState.purpose == PURPOSE))
    if not record or record.expires_at <= datetime.utcnow():
        raise HTTPException(400, 'Expired or invalid authorization. Start again.')
    metadata = json.loads(record.metadata_json)
    if metadata.get('actor_id') != user.id or metadata.get('redirect_uri') != redirect_uri() or metadata.get('authority') != authority():
        raise HTTPException(400, 'Authorization belongs to another session or installation')
    # Atomic consumption, committed BEFORE calling Microsoft. Concurrent/replayed callbacks cannot exchange twice.
    consumed = await db.execute(delete(OAuthState).where(OAuthState.id == record.id))
    await db.commit()
    if consumed.rowcount != 1:
        raise HTTPException(400, 'Authorization already used')
    if error or not code:
        return RedirectResponse('/inboxes?office365=cancelled', status_code=303)
    tokens, email = await exchange(code, metadata['redirect_uri'], metadata['verifier'])
    inbox_id = metadata.get('inbox_id')
    if inbox_id is not None:
        inbox = await db.scalar(select(Inbox).where(Inbox.id == inbox_id).with_for_update())
        if not inbox or inbox.provider != 'office365' or inbox.email.lower() != email:
            raise HTTPException(409, 'Choose the same Office365 account to reconnect')
    else:
        if await db.scalar(select(Inbox.id).where(func.lower(Inbox.email) == email)):
            raise HTTPException(409, 'Mailbox already exists. Use reconnect for an existing Office365 mailbox.')
        inbox = Inbox(email=email, display_name=email, provider='office365', paused=True)
        db.add(inbox)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, 'Mailbox already exists') from None
    account = await db.scalar(select(Office365Account).where(Office365Account.inbox_id == inbox.id))
    if account is None:
        account = Office365Account(inbox_id=inbox.id, microsoft_email=email)
        db.add(account)
    account.access_token = tokens['access_token']
    account.refresh_token = tokens['refresh_token']
    account.token_expiry = datetime.utcnow()+timedelta(seconds=tokens['expires_in'])
    account.scopes = tokens['scope']
    audit(db, user, 'mail.office365.reconnect' if inbox_id else 'mail.office365.connect', {'inbox_id': inbox.id, 'email': email})
    await db.commit()
    response = RedirectResponse('/inboxes?office365=connected', status_code=303)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response
