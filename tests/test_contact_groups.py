"""Existing contacts -> reusable group -> campaign, without identity or safety changes."""
from datetime import datetime
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from app.models import Lead, ContactList, ContactListMember, CampaignLead
from app.schemas import ContactListCreate, ContactListMembers
from app.routers.leads import create_contact_list, add_contact_list_members, remove_contact_list_members
from app.routers.campaigns import add_contact_group_to_campaign
from app.suppression import suppress_email, is_suppressed
from tests.conftest import make_lead, make_campaign, make_campaign_lead

@pytest.mark.asyncio
async def test_group_flow_preserves_contacts_suppression_archive_and_enrollments(session):
    active=await make_lead(session, email='active@example.com')
    blocked=await make_lead(session,email='blocked@example.com')
    archived=await make_lead(session,email='archived@example.com')
    archived.archived_at=datetime.utcnow()
    active.provider='Google'
    await suppress_email(session,blocked.email,reason='manual',source='test',stop_active_sends=False)
    campaign=await make_campaign(session,paused=True)
    group=await create_contact_list(ContactListCreate(name='  Partners  ',lead_ids=[active.id,active.id,blocked.id]),session)
    assert group.name=='Partners' and group.member_count==2
    assert await add_contact_list_members(group.id,ContactListMembers(lead_ids=[active.id,archived.id]),session)=={'added':1,'already_members':1}
    result=await add_contact_group_to_campaign(campaign.id,group.id,True,False,session)
    await session.commit()
    assert (result['added'],result['suppressed'],result['errors'])==(1,1,1)
    again=await add_contact_group_to_campaign(campaign.id,group.id,False,False,session)
    assert again['added']==0 and again['already_enrolled']==1
    assert await remove_contact_list_members(group.id,ContactListMembers(lead_ids=[active.id]),session)=={'removed':1}
    assert await session.get(Lead,active.id) is active
    assert await session.scalar(select(func.count()).select_from(Lead))==3
    assert await session.scalar(select(CampaignLead.lead_id).where(CampaignLead.campaign_id==campaign.id))==active.id
    assert await is_suppressed(session,blocked.email)
    assert archived.archived_at and campaign.paused

@pytest.mark.asyncio
async def test_group_validation_is_atomic_and_membership_is_idempotent(session):
    lead=await make_lead(session)
    for data in [ContactListCreate(name=' '),ContactListCreate(name='Missing',lead_ids=[lead.id,99999])]:
        with pytest.raises(HTTPException):await create_contact_list(data,session)
    assert await session.scalar(select(func.count()).select_from(ContactList))==0
    group=await create_contact_list(ContactListCreate(name='Valid'),session)
    with pytest.raises(HTTPException):await add_contact_list_members(group.id,ContactListMembers(lead_ids=[lead.id,99999]),session)
    assert await session.scalar(select(func.count()).select_from(ContactListMember))==0
    for expected in [1,0]:
        r=await add_contact_list_members(group.id,ContactListMembers(lead_ids=[lead.id,lead.id]),session)
        assert r['added']==expected
    with pytest.raises(HTTPException):await create_contact_list(ContactListCreate(name=' VALID '),session)

@pytest.mark.asyncio
async def test_global_duplicates_across_multiple_campaigns_and_empty_group(session):
    lead=await make_lead(session)
    lead.provider='Google'
    first=await make_campaign(session,name='First');second=await make_campaign(session,name='Second');third=await make_campaign(session,name='Third')
    await make_campaign_lead(session,first.id,lead.id);await make_campaign_lead(session,second.id,lead.id)
    group=await create_contact_list(ContactListCreate(name='Shared',lead_ids=[lead.id]),session)
    r=await add_contact_group_to_campaign(third.id,group.id,True,False,session)
    assert r['already_enrolled']==1 and r['errors']==0 and r['added']==0
    r=await add_contact_group_to_campaign(third.id,group.id,False,False,session)
    assert r['added']==1
    await remove_contact_list_members(group.id,ContactListMembers(lead_ids=[lead.id]),session)
    with pytest.raises(HTTPException) as exc:await add_contact_group_to_campaign(third.id,group.id,True,False,session)
    assert exc.value.status_code==422

@pytest.mark.asyncio
async def test_group_routes_require_auth_and_accept_existing_contact_ids(session):
    import httpx
    from app.main import app
    from app.auth import get_current_user
    from app.database import get_db
    from app.models import User
    lead=await make_lead(session)
    lead.provider='Google'
    campaign=await make_campaign(session,paused=True)
    actor=User(username='group-editor',email='groups@example.com');session.add(actor);await session.commit()
    async def db():
        yield session
        await session.commit()
    old=dict(app.dependency_overrides)
    app.dependency_overrides[get_db]=db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            for path,body in [('/api/leads/lists',{'name':'Private'}),('/api/leads/lists/1/members',{'lead_ids':[lead.id]}),('/api/leads/lists/1/members/remove',{'lead_ids':[lead.id]}),(f'/api/campaigns/{campaign.id}/contact-groups/1',{})]:
                assert (await client.post(path,json=body)).status_code==401
            app.dependency_overrides[get_current_user]=lambda:actor
            r=await client.post('/api/leads/lists',json={'name':'Existing','lead_ids':[lead.id]})
            assert r.status_code==200,r.text
            group_id=r.json()['id']
            r=await client.post(f'/api/campaigns/{campaign.id}/contact-groups/{group_id}',json={})
            assert r.status_code==200 and r.json()['added']==1,r.text
            assert (await client.post(f'/api/leads/lists/{group_id}/members',json={'lead_ids':[]})).status_code==422
    finally:
        app.dependency_overrides.clear();app.dependency_overrides.update(old)
