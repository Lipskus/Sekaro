"""Outbound-only endpoint protocol. Configuration and keys stay on the private host."""
import hashlib
import hmac
import json
import os
import ssl
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from app.models import EndpointCursor, EndpointSubject, EmailLog, EmailOpen, EmailClick, TrackedLink, LeadUnsubscribeToken, Lead
from app.suppression import suppress_email


def configuration():
    filename = os.getenv('SEKARO_ENDPOINT_CONFIG')
    if not filename:
        return {'mode':'legacy','endpoints':[]}
    data = json.loads(Path(filename).read_text())
    if data.get('mode') not in ('private','unsubscribe','tracking'):
        raise ValueError('Invalid public endpoint mode')
    data.setdefault('endpoints', [])
    ids = set()
    epochs = set()
    assignments = set()
    default = False
    for p in data.get('endpoints', []):
        if not p.get('id') or p['id'] in ids or not p.get('epoch'):
            raise ValueError('Endpoint needs unique id and paired epoch')
        if p['epoch'] in epochs:
            raise ValueError('Use one profile for each endpoint store, shared by many mailboxes')
        epochs.add(p['epoch'])
        ids.add(p['id'])
        for field in ('sync_url','public_url'):
            u = urlsplit(p.get(field,''))
            _ = u.port
            if not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/'):
                raise ValueError('Endpoint URLs must be origins')
            if u.scheme != 'https' and not (field=='sync_url' and u.scheme=='http' and p.get('transport') in ('local','mesh','lan')):
                raise ValueError('HTTPS required outside explicit private transport')
        if not p.get('retired'):
            values = set(p.get('inbox_ids', []))
            if any(type(i) is not int or i<1 for i in values) or assignments & values or (not values and default):
                raise ValueError('Conflicting endpoint assignments')
            assignments |= values
            default |= not values
    return data


def profile_for(inbox_id):
    profiles = [p for p in configuration()['endpoints'] if not p.get('retired')]
    return next((p for p in profiles if inbox_id in p.get('inbox_ids', [])),
                next((p for p in profiles if not p.get('inbox_ids')), None))


def subject_for(email):
    from app.settings_manager import settings
    cfg=configuration()
    secret = (Path(cfg['subject_key_file']).read_text().strip() if cfg.get('subject_key_file') else None) or os.getenv('SEKARO_ENDPOINT_SUBJECT_KEY') or getattr(settings,'secret_key',None) or os.getenv('QUICKLY_SECRET_KEY')
    if not secret or len(secret) < 32:
        raise ValueError('Stable private subject key (at least 32 characters) required')
    return hmac.new(secret.encode(),email.strip().lower().encode(),hashlib.sha256).hexdigest()


def client(p):
    key = Path(p['key_file']).read_text().strip()
    if len(key)<32:
        raise ValueError('Invalid synchronization key')
    headers = {'Authorization':'Bearer '+key}
    if p.get('access_id_file'):
        headers.update({'CF-Access-Client-Id':Path(p['access_id_file']).read_text().strip(),
                        'CF-Access-Client-Secret':Path(p['access_secret_file']).read_text().strip()})
    context = ssl.create_default_context(cafile=p.get('ca_file'))
    if p.get('cert_file'):
        context.load_cert_chain(p['cert_file'],p['cert_key_file'])
    return httpx.AsyncClient(base_url=p['sync_url'].rstrip('/'),headers=headers,verify=context,
                             timeout=15,follow_redirects=False,trust_env=False)


async def request(c, method, path, **kwargs):
    async with c.stream(method,path,**kwargs) as r:
        if r.status_code != 200:
            raise RuntimeError('Endpoint synchronization refused or unavailable')
        parts=[]
        total=0
        async for chunk in r.aiter_bytes():
            total+=len(chunk)
            if total>2097152:
                raise RuntimeError('Endpoint response too large')
            parts.append(chunk)
        return json.loads(b''.join(parts))



async def sync_endpoint(db, p):
    # PostgreSQL serializes concurrent consumers. The durable cursor and effects
    # commit together; a failed ACK is safe to retry after any process restart.
    cursor = await db.get(EndpointCursor,p['id'])
    if cursor is None:
        cursor = EndpointCursor(endpoint_id=p['id'],epoch=p['epoch'],cursor=0)
        db.add(cursor)
        await db.flush()
    cursor = (await db.execute(select(EndpointCursor).where(EndpointCursor.endpoint_id==p['id'])
                              .with_for_update().execution_options(populate_existing=True))).scalar_one()
    if cursor.epoch != p['epoch']:
        raise RuntimeError('Endpoint identity changed; recover before sending')
    async with client(p) as c:
        status = await request(c,'GET','/v1/status')
        if status.get('protocol')!=1 or status.get('epoch')!=cursor.epoch or status.get('ack',0)>cursor.cursor or status.get('high',-1)<cursor.cursor:
            raise RuntimeError('Endpoint continuity lost; recover before sending')
        for _ in range(100):
            batch = await request(c,'GET','/v1/events',params={'epoch_id':cursor.epoch,'after':cursor.cursor})
            if batch.get('epoch')!=cursor.epoch:
                raise RuntimeError('Endpoint identity mismatch')
            events = batch['events']
            if not events:
                break
            for event in events:
                if event['id']!=cursor.cursor+1:
                    raise RuntimeError('Gap in endpoint event stream')
                token = event['token']
                if event['kind']=='unsubscribe':
                    row = await db.scalar(select(LeadUnsubscribeToken).where(LeadUnsubscribeToken.token==token))
                    if row is None:
                        raise RuntimeError('Unknown unsubscribe token; synchronization paused')
                    lead = await db.get(Lead,row.lead_id)
                    if lead:
                        await suppress_email(db,lead.email,reason='unsubscribe',source='public_endpoint',stop_active_sends=True)
                elif event['kind'] in ('open','click'):
                    if event['kind']=='open':
                        log = await db.scalar(select(EmailLog).where(EmailLog.open_token==token))
                    else:
                        link = await db.scalar(select(TrackedLink).where(TrackedLink.token==token))
                        log = await db.get(EmailLog,link.email_log_id) if link else None
                    if log is not None:
                        if event['kind']=='open':
                            log.opened=True
                            db.add(EmailOpen(email_log_id=log.id))
                        else:
                            log.clicked=True
                            db.add(EmailClick(email_log_id=log.id))
                    # Tokens registered for an aborted delivery can legitimately
                    # outlive its deleted draft log; no delivery stats to apply.
                else:
                    raise RuntimeError('Invalid endpoint event')
                cursor.cursor=event['id']
            await db.commit()
            await request(c,'POST','/v1/ack',json={'epoch':cursor.epoch,'cursor':cursor.cursor})
            cursor = (await db.execute(select(EndpointCursor).where(EndpointCursor.endpoint_id==p['id'])
                                      .with_for_update().execution_options(populate_existing=True))).scalar_one()
        else:
            raise RuntimeError('Endpoint backlog must drain before sending')
        await db.commit()
        await request(c,'POST','/v1/ack',json={'epoch':cursor.epoch,'cursor':cursor.cursor})


async def before_send(db, email, inbox_id, *, synchronize=True):
    cfg=configuration()
    if cfg['mode']=='legacy':
        return None
    active=profile_for(inbox_id)
    if cfg['mode']!='private' and active is None:
        return 'endpoint_unavailable'
    # Retired endpoints remain checked: old unsubscribe links stay authoritative.
    subject=subject_for(email) if cfg['endpoints'] else None
    previous=set((await db.execute(select(EndpointSubject.endpoint_id).where(EndpointSubject.subject==subject))).scalars())
    profiles=[p for p in cfg['endpoints'] if p['id'] in previous or p==active]
    try:
        for p in profiles:
            if synchronize:
                await sync_endpoint(db,p)
            async with client(p) as c:
                s=subject_for(email)
                result=await request(c,'POST','/v1/check',json={'epoch':p['epoch'],'subjects':[s]})
                if s in result['blocked']:
                    await suppress_email(db,email,reason='unsubscribe',source='public_endpoint',stop_active_sends=True)
                    return 'suppressed'
    except Exception:
        if synchronize:
            await db.rollback()
        return 'endpoint_unavailable'
    return None


async def register_delivery(db, inbox, lead, campaign, unsub, email_log, links):
    cfg=configuration()
    if cfg['mode'] in ('legacy','private'):
        return
    p=profile_for(inbox.id)
    if not p:
        raise RuntimeError('No endpoint assigned to mailbox')
    if await db.get(EndpointSubject, (p['id'], subject_for(lead.email))) is None:
        db.add(EndpointSubject(endpoint_id=p['id'],subject=subject_for(lead.email)))
        await db.flush()
    items=[{'kind':'unsubscribe','token':unsub.token,'subject':subject_for(lead.email)}]
    if cfg['mode']=='tracking':
        if campaign.track_opens:
            items.append({'kind':'open','token':email_log.open_token,'subject':subject_for(lead.email)})
        items += [{'kind':'click','token':token,'target':url,'subject':subject_for(lead.email)} for token,url in links]
    async with client(p) as c:
        for i in range(0,len(items),250):
            await request(c,'POST','/v1/register',json={'epoch':p['epoch'],'items':items[i:i+250]})


def validate_content(campaign, *parts):
    mode=configuration()['mode']
    if mode=='legacy':
        return
    if mode!='tracking' and (campaign.track_opens or campaign.track_clicks):
        raise ValueError('Tracking is disabled in the installation mode')
    if mode=='private':
        from app.template_renderer import extract_variables
        if 'unsubscribe_link' in extract_variables(*parts):
            raise ValueError('unsubscribe_link requires a public endpoint; remove it or enable unsubscribe mode')


async def synchronize_all():
    import logging
    from app.database import AsyncSessionLocal
    for p in configuration()['endpoints']:
        async with AsyncSessionLocal() as db:
            try:
                await sync_endpoint(db,p)
            except Exception:
                await db.rollback()
                logging.getLogger(__name__).warning('Endpoint synchronization failed: %s',p['id'])


async def migrate_existing():
    """Copy existing token mappings before moving old public DNS to this service."""
    from app.database import AsyncSessionLocal
    from app.models import Inbox, CampaignInbox
    async with AsyncSessionLocal() as db:
        inboxes=list((await db.execute(select(Inbox))).scalars())
        for p in configuration()['endpoints']:
            if p.get('retired'):
                continue
            inbox_ids=[i.id for i in inboxes if profile_for(i.id)==p]
            campaign_ids=set((await db.execute(select(CampaignInbox.campaign_id).where(CampaignInbox.inbox_id.in_(inbox_ids)))).scalars())
            campaign_ids.update((await db.execute(select(EmailLog.campaign_id).where(EmailLog.inbox_id.in_(inbox_ids)))).scalars())
            items=[]
            subject_cache={}
            async def subject(lead_id):
                if lead_id not in subject_cache:
                    lead=await db.get(Lead,lead_id)
                    value=subject_for(lead.email)
                    subject_cache[lead_id]=value
                    if await db.get(EndpointSubject,(p['id'],value)) is None:
                        db.add(EndpointSubject(endpoint_id=p['id'],subject=value))
                return subject_cache[lead_id]
            tokens=(await db.execute(select(LeadUnsubscribeToken).where(LeadUnsubscribeToken.campaign_id.in_(campaign_ids)))).scalars()
            for row in tokens:
                items.append({'kind':'unsubscribe','token':row.token,'subject':await subject(row.lead_id)})
            logs=list((await db.execute(select(EmailLog).where(EmailLog.inbox_id.in_(inbox_ids)))).scalars())
            for row in logs:
                value=await subject(row.lead_id)
                if row.open_token:
                    items.append({'kind':'open','token':row.open_token,'subject':value})
                for link in (await db.execute(select(TrackedLink).where(TrackedLink.email_log_id==row.id))).scalars():
                    items.append({'kind':'click','token':link.token,'target':link.original_url,'subject':value})
            async with client(p) as c:
                for i in range(0,len(items),250):
                    await request(c,'POST','/v1/register',json={'epoch':p['epoch'],'items':items[i:i+250]})
            await db.commit()
            print('Mappings synchronized for',p['id'],':',len(items))


if __name__=='__main__':
    import asyncio
    import sys
    if sys.argv[1:]!=['migrate-existing']:
        raise SystemExit('Usage: python -m app.endpoint_client migrate-existing')
    asyncio.run(migrate_existing())
