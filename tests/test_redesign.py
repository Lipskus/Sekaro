"""Native redesign API tests: no SMTP connections, no demonstration data in production."""
from datetime import datetime, timedelta
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from app.models import Lead, CampaignLead, QueueSlot, AppSetting, SmtpMessage, SmtpThread
from app.routers.contact_fields import (
    FieldCreate, FieldUpdate, create_contact_field, list_contact_fields,
    update_contact_field, delete_contact_field,
)
from app.routers.ui import ContactCreate, create_contact, inbox_view
from app.suppression import suppress_email
from tests.conftest import make_inbox

@pytest.mark.asyncio
async def test_field_type_and_options_are_persisted(session):
    field=await create_contact_field(FieldCreate(key="status_wlasny",label="Status własny",field_type="select",options=["A","B"," A "]),session)
    assert field.options==["A","B"]
    listed=await list_contact_fields(session)
    restored=next(row for row in listed if row.key==field.key)
    assert restored.field_type=="select"
    assert restored.options==["A","B"]
    updated=await update_contact_field(field.id,FieldUpdate(label="Nowa nazwa",field_type="textarea"),session)
    assert updated.key=="status_wlasny" and updated.options==[]
    assert updated.label=="Nowa nazwa"

@pytest.mark.asyncio
async def test_delete_definition_preserves_contact_values_by_default(session):
    field=await create_contact_field(FieldCreate(key="wlasne",label="Własne"),session)
    contact=Lead(email="one@example.com",name="One",custom_data={"wlasne":"tekst","inne":0})
    session.add(contact);await session.commit()
    result=await delete_contact_field(field.id,False,session)
    assert not result["purged"]
    await session.refresh(contact)
    assert contact.custom_data=={"wlasne":"tekst","inne":0}
    listed=await list_contact_fields(session)
    assert next(row for row in listed if row.key=="wlasne").defined is False

@pytest.mark.asyncio
async def test_explicit_field_purge_removes_only_selected_key(session):
    field=await create_contact_field(FieldCreate(key="usun",label="Usuń"),session)
    lead=Lead(email="two@example.com",name="Two",custom_data={"usun":"tekst","zostaw":False})
    session.add(lead);await session.commit()
    result=await delete_contact_field(field.id,True,session)
    assert result["affected_contacts"]==1
    await session.refresh(lead)
    assert lead.custom_data=={"zostaw":False}
    assert await session.get(AppSetting,"sekaro.contact_field.usun") is None
    assert "usun" not in {row.key for row in await list_contact_fields(session)}

@pytest.mark.asyncio
async def test_system_keys_cannot_be_defined_as_custom_fields(session):
    for key in ["email","name","unsubscribe_link"]:
        with pytest.raises(HTTPException) as error:
            await create_contact_field(FieldCreate(key=key),session)
        assert error.value.status_code==409

@pytest.mark.asyncio
async def test_new_contact_is_global_and_not_enrolled_or_scheduled(session):
    created=await create_contact(ContactCreate(email="CONTACT@Example.com",name=" Nowy ",custom_data={"dowolne":"ABC"}),session)
    assert created.email=="contact@example.com" and created.name=="Nowy"
    assert created.custom_data=={"dowolne":"ABC"}
    assert (await session.execute(select(func.count()).select_from(CampaignLead))).scalar()==0
    assert (await session.execute(select(func.count()).select_from(QueueSlot))).scalar()==0
    with pytest.raises(HTTPException) as error:
        await create_contact(ContactCreate(email="contact@example.com"),session)
    assert error.value.status_code==409

@pytest.mark.asyncio
async def test_contact_creation_does_not_reactivate_suppressed_address(session):
    await suppress_email(session,"blocked@example.com",stop_active_sends=False)
    await session.commit()
    with pytest.raises(HTTPException) as error:
        await create_contact(ContactCreate(email="BLOCKED@example.com"),session)
    assert error.value.status_code==409
    assert (await session.execute(select(func.count()).select_from(Lead))).scalar()==0

@pytest.mark.asyncio
async def test_inbox_filter_uses_latest_message_direction_per_mailbox(session,monkeypatch):
    """Same thread key in different inboxes must never mix reply state."""
    a=await make_inbox(session,email="a@example.com",provider="smtp")
    b=await make_inbox(session,email="b@example.com",provider="smtp")
    now=datetime.utcnow()
    for inbox,direction in [(a,"received"),(b,"sent")]:
        session.add(SmtpThread(inbox_id=inbox.id,thread_key="same",subject="Wiadomość",last_received_at=now))
        await session.flush()
        session.add(SmtpMessage(inbox_id=inbox.id,message_id="msg",thread_key="same",received_at=now,created_at=now,direction=direction))
    await session.commit()
    async def source(*args,**kwargs):
        return {"items":[{"thread_id":"same","inbox_id":i.id,"subject":"Wiadomość","lead_status":"active","unread_lead_reply":True} for i in [a,b]]}
    monkeypatch.setattr("app.routers.ui.list_unibox_conversations",source)
    result=await inbox_view(page=1,page_size=50,inbox_id=None,q="",tab="needs_reply",leads_only=False,db=session)
    assert result["total"]==1 and result["items"][0]["inbox_id"]==a.id
    assert result["counts"]["all"]==2 and result["counts"]["needs_reply"]==1
    filtered=await inbox_view(page=1,page_size=50,inbox_id=b.id,q="",tab="all",leads_only=False,db=session)
    assert filtered["total"]==1 and filtered["items"][0]["needs_reply"] is False

@pytest.mark.asyncio
async def test_reply_checks_suppression_before_calling_sender(session,monkeypatch):
    from app.routers.ui import ReplyRequest,reply_from_inbox
    calls=[]
    async def sender(*args):
        calls.append(args)
        return {"ok":True}
    monkeypatch.setattr("app.routers.ui.send_unibox_email",sender)
    inbox=await make_inbox(session,email="reply@example.com",provider="smtp")
    await suppress_email(session,"blocked@example.com",stop_active_sends=False)
    await session.commit()
    payload=ReplyRequest(inbox_id=inbox.id,to_email="blocked@example.com",subject="Test",body="Test")
    with pytest.raises(HTTPException) as error:
        await reply_from_inbox(payload,session)
    assert error.value.status_code==409 and not calls
    payload.to_email="allowed@example.com"
    inbox.paused=True;await session.commit()
    with pytest.raises(HTTPException):await reply_from_inbox(payload,session)
    assert not calls
    inbox.paused=False;await session.commit()
    assert await reply_from_inbox(payload,session)=={"ok":True}
    assert len(calls)==1
