from datetime import datetime, timedelta
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from app.models import GmailThread, Office365Thread, SmtpThread, SmtpMessage, ConversationState
from app.conversation_state import move_conversation, stamp
from app.unibox import list_unibox_conversations, get_notification_count
from app.routers.ui import inbox_view
from tests.conftest import make_inbox


@pytest.mark.asyncio
@pytest.mark.parametrize('provider', ['smtp', 'gmail', 'office365'])
async def test_folders_restore_and_new_activity(session, provider):
    inbox = await make_inbox(session, provider=provider)
    now = datetime(2026, 10, 12, 12)
    if provider == 'gmail':
        row = GmailThread(inbox_id=inbox.id, thread_id='same', last_internal_date=stamp(now), unread_lead_reply=True)
        when = 'last_internal_date'
    elif provider == 'office365':
        row = Office365Thread(inbox_id=inbox.id, conversation_id='same', last_received_at=now, unread_lead_reply=True)
        when = 'last_received_at'
    else:
        row = SmtpThread(inbox_id=inbox.id, thread_key='same', last_received_at=now, unread_lead_reply=True)
        when = 'last_received_at'
    session.add(row); await session.commit()
    for folder in ('archive', 'trash'):
        await move_conversation(session, inbox.id, 'same', folder); await session.commit()
        assert (await list_unibox_conversations(session, page=1, page_size=30))['total'] == 0
        assert await get_notification_count(session) == 0
        archived = await list_unibox_conversations(session, page=1, page_size=30, folder=folder)
        assert archived['total'] == 1 and archived['items'][0]['folder'] == folder
        # Repeated synchronization of the same metadata must not unarchive it.
        await session.refresh(row)
        assert (await list_unibox_conversations(session, page=1, page_size=30, folder=folder))['total'] == 1
        await move_conversation(session, inbox.id, 'same', 'inbox'); await session.commit()
        assert (await list_unibox_conversations(session, page=1, page_size=30))['total'] == 1
        assert await get_notification_count(session) == 1
    await move_conversation(session, inbox.id, 'same', 'archive'); await session.commit()
    later = now + timedelta(minutes=1)
    setattr(row, when, stamp(later) if provider == 'gmail' else later); await session.commit()
    assert (await list_unibox_conversations(session, page=1, page_size=30))['total'] == 1
    assert (await list_unibox_conversations(session, page=1, page_size=30, folder='archive'))['total'] == 0
    assert await get_notification_count(session) == 1


@pytest.mark.asyncio
async def test_mailbox_scope_history_and_filtered_counts(session):
    now = datetime(2026, 10, 12)
    boxes = [await make_inbox(session, email=f'box{i}@example.test', provider='smtp') for i in range(2)]
    for box in boxes:
        session.add(SmtpThread(inbox_id=box.id, thread_key='same', last_received_at=now, subject='Keep history'))
        await session.flush()
        session.add(SmtpMessage(inbox_id=box.id, thread_key='same', message_id='msg', received_at=now, direction='received', body_plain='Keep message'))
    await session.commit()
    await move_conversation(session, boxes[0].id, 'same', 'trash'); await session.commit()
    async def view(tab, **kwargs):
        return await inbox_view(page=1, page_size=1, inbox_id=None, q='Keep', tab=tab, leads_only=False, db=session, **kwargs)
    result = await view('all')
    assert result['total'] == 1 and result['items'][0]['inbox_id'] == boxes[1].id
    assert result['counts']['trash'] == 1 and result['counts']['all'] == 1
    trash = await view('trash')
    assert trash['total'] == 1 and trash['items'][0]['inbox_id'] == boxes[0].id
    assert await session.scalar(select(func.count(SmtpMessage.message_id))) == 2
    assert await session.scalar(select(func.count(SmtpThread.thread_key))) == 2
    with pytest.raises(HTTPException) as exc:
        await move_conversation(session, boxes[0].id, 'missing', 'trash')
    assert exc.value.status_code == 404
    assert await session.scalar(select(func.count(ConversationState.thread_id))) == 1


def test_write_permission_and_folder_validation():
    from app.access import required_permissions
    from app.routers.unibox import ConversationMove
    from pydantic import ValidationError
    assert required_permissions('/api/unibox/conversation-folder', 'POST') == {'mail.read', 'mail.write'}
    with pytest.raises(ValidationError):
        ConversationMove(inbox_id=1, thread_id='thread', folder='delete-permanently')
