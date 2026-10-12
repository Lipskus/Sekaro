"""CRM integration: immutable delivery IDs, merge conflicts and suppression boundaries."""
import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from app.auth import get_current_user
from app.database import get_db
from app.main import app
from app.models import User, Lead, LeadReply, EmailLog, SendAttempt, QueueSlot
from app.crm_models import CrmProfile, ContactAddress, Company, CompanyContact, CrmNote
from app.crm import merge_preview, merge_contacts, contact_view, protect_delete
from app.contact_lifecycle import set_archived
from app.outbound_safety import outbound_block_reason
from app.suppression import suppress_email, is_suppressed
from tests.conftest import make_lead, make_campaign, make_campaign_lead, make_inbox, make_queue_slot, make_email_log

async def people(db):
    actor=User(username='crm-editor',email='editor@example.com')
    db.add(actor)
    target=await make_lead(db,email='target@example.com',name='Target')
    source=await make_lead(db,email='source@example.com',name='Source')
    target.custom_data={'title':'Manager','keep':'yes'}
    source.custom_data={'title':'Director','new':'value'}
    db.add_all([CrmProfile(lead_id=target.id,kind='person'),CrmProfile(lead_id=source.id,kind='person')])
    await db.flush()
    return actor,target,source

@pytest.mark.asyncio
async def test_merge_preserves_ids_messages_notes_companies_and_uncertain_claim(session):
    actor,target,source=await people(session)
    campaign=await make_campaign(session); inbox=await make_inbox(session)
    left=await make_campaign_lead(session,campaign.id,target.id)
    right=await make_campaign_lead(session,campaign.id,source.id)
    message=await make_email_log(session,source.id,campaign.id,inbox_id=inbox.id)
    reply=LeadReply(lead_id=source.id,campaign_id=campaign.id);session.add(reply)
    slot=await make_queue_slot(session,right.id,inbox.id)
    claim=await make_queue_slot(session,right.id,inbox.id,sequence_index=1)
    session.add(SendAttempt(queue_slot_id=claim.id,attempt_token='crm-uncertain'))
    c=Company(name='Company');session.add(c);await session.flush()
    session.add_all([CompanyContact(company_id=c.id,lead_id=source.id,role='Buyer'),CrmNote(lead_id=source.id,body='Original note',actor_name=actor.username,actor_id=actor.id)])
    await suppress_email(session,source.email,reason='unsubscribe',source='test',stop_active_sends=False)
    await session.commit()
    preview=await merge_preview(session,target.id,source.id)
    assert {x['field'] for x in preview['conflicts']}=={'name','title'}
    result=await merge_contacts(session,target.id,source.id,preview['fingerprint'],{'name':'source','title':'target'},actor)
    await session.commit()
    assert result['name']=='Source' and result['custom_data']=={'title':'Manager','keep':'yes','new':'value'}
    assert result['notes'][0]['lead_id']==source.id and result['companies'][0]['lead_id']==source.id
    assert message.lead_id==source.id and reply.lead_id==source.id
    assert await session.get(Lead,source.id) is source
    assert source.archived_at and target.archived_at is None
    assert left.sending_paused and right.sending_paused and left.archive_sending_paused
    assert (await session.execute(select(QueueSlot.id))).scalars().all()==[claim.id]
    assert await is_suppressed(session,target.email)
    for identity in [source.id,target.id]:
        with pytest.raises(HTTPException): await protect_delete(session,[identity])
    with pytest.raises(HTTPException): await set_archived(session,[source.id],False,actor)

@pytest.mark.asyncio
async def test_stale_preview_and_missing_choices_are_rejected_without_merge(session):
    actor,target,source=await people(session)
    preview=await merge_preview(session,target.id,source.id)
    with pytest.raises(HTTPException) as error:
        await merge_contacts(session,target.id,source.id,preview['fingerprint'],{},actor)
    assert error.value.status_code==422
    source.name='Changed';await session.flush()
    with pytest.raises(HTTPException) as error:
        await merge_contacts(session,target.id,source.id,preview['fingerprint'],{'name':'source','title':'target'},actor)
    assert error.value.status_code==409
    assert source.archived_at is None

@pytest.mark.asyncio
@pytest.mark.parametrize('kind',['unspecified','shared_mailbox'])
async def test_merge_requires_explicit_person_identity(session,kind):
    actor,target,source=await people(session)
    profile=await session.get(CrmProfile,source.id);profile.kind=kind;await session.flush()
    with pytest.raises(HTTPException) as error: await merge_preview(session,target.id,source.id)
    assert error.value.status_code==409

@pytest.mark.asyncio
async def test_later_unsubscribe_on_old_identity_blocks_survivor_and_secondary_email(session):
    actor,target,source=await people(session);inbox=await make_inbox(session)
    session.add(ContactAddress(lead_id=target.id,email='secondary@example.com',label='work'));await session.flush()
    preview=await merge_preview(session,target.id,source.id)
    await merge_contacts(session,target.id,source.id,preview['fingerprint'],{'name':'target','title':'target'},actor)
    await session.commit()
    assert await outbound_block_reason(session,target.email,inbox.id) is None
    await suppress_email(session,source.email,stop_active_sends=False)
    assert await outbound_block_reason(session,target.email,inbox.id)=='suppressed'
    assert await outbound_block_reason(session,'secondary@example.com',inbox.id)=='suppressed'

@pytest.mark.asyncio
async def test_crm_private_api_crud_and_relations(session):
    actor,target,source=await people(session);await session.commit()
    async def db(): yield session
    old=dict(app.dependency_overrides)
    app.dependency_overrides[get_db]=db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            assert (await client.get('/api/crm/companies')).status_code==401
            app.dependency_overrides[get_current_user]=lambda:actor
            assert (await client.get(f'/api/crm/contacts/{target.id}')).json()['companies']==[]
            company=(await client.post('/api/crm/companies',json={'name':'Example Ltd'})).json()
            assert company['name']=='Example Ltd'
            for lead in [target,source]:
                r=await client.post(f'/api/crm/contacts/{lead.id}/companies',json={'company_id':company['id'],'role':'Buyer'})
                assert r.status_code==200,r.text
            detail=(await client.get('/api/crm/companies/'+str(company['id']))).json()
            assert len(detail['contacts'])==2
            assert all(x['actor_name']==actor.username for x in detail['history'])
            address=await client.post(f'/api/crm/contacts/{target.id}/addresses',json={'email':'extra@example.com','label':'Other'})
            assert address.status_code==201,address.text
            assert (await client.post(f'/api/crm/contacts/{target.id}/addresses',json={'email':'EXTRA@example.com'})).status_code==409
            assert (await client.get('/api/leads?q=extra@example.com')).json()[0]['id']==target.id
            note=await client.post(f'/api/crm/contacts/{target.id}/notes',json={'body':'Call next week','actor_name':'spoof'})
            assert note.status_code==201 and note.json()['notes'][0]['actor_name']==actor.username
            assert (await client.post(f'/api/crm/contacts/{target.id}/notes',json={'body':' '})).status_code==422
            assert (await client.post('/api/crm/companies/'+str(company['id'])+'/archive',json={'archived':True})).status_code==200
            assert (await client.get('/api/crm/companies')).json()==[]
            assert len((await client.get('/api/crm/companies?archived=true')).json())==1
            assert (await client.post(f'/api/crm/contacts/{target.id}/companies',json={'company_id':company['id']})).status_code==409
    finally:
        app.dependency_overrides.clear();app.dependency_overrides.update(old)

@pytest.mark.asyncio
async def test_archive_blocks_secondary_address_without_suppression(session):
    actor,target,source=await people(session);inbox=await make_inbox(session)
    session.add(ContactAddress(lead_id=target.id,email='extra@example.com'));await session.flush()
    await set_archived(session,[target.id],True,actor)
    assert await outbound_block_reason(session,'extra@example.com',inbox.id)=='archived'

@pytest.mark.asyncio
async def test_same_address_merge_uses_canonical_archive_state(session):
    actor,target,source=await people(session)
    source.email=target.email;await session.flush()
    inbox=await make_inbox(session)
    preview=await merge_preview(session,target.id,source.id)
    await merge_contacts(session,target.id,source.id,preview['fingerprint'],{'name':'target','title':'target'},actor)
    await session.commit()
    # Source remains archived for campaign identity; canonical contact controls manual sends.
    assert source.archived_at and target.archived_at is None
    assert await outbound_block_reason(session,target.email,inbox.id) is None
    await set_archived(session,[target.id],True,actor)
    assert await outbound_block_reason(session,target.email,inbox.id)=='archived'
