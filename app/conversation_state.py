"""Local conversation organization, independent of provider synchronization."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from app.models import Inbox, GmailThread, Office365Thread, SmtpThread, ConversationState
from app.time import utcnow


def stamp(value):
    if value is None:
        return 0
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    return int(value)  # Gmail uses epoch milliseconds.


async def annotate_conversations(db, items):
    rows = (await db.execute(select(ConversationState))).scalars()
    states = {(r.inbox_id, r.thread_id): r for r in rows}
    for item in items:
        row = states.get((item['inbox_id'], item['thread_id']))
        # New activity returns the conversation to Inbox. Syncing the same
        # messages or fetching older history cannot overwrite the saved state.
        item['folder'] = row.folder if row and stamp(item.get('timestamp')) <= row.message_watermark else 'inbox'


async def move_conversation(db, inbox_id, thread_id, folder):
    inbox = await db.get(Inbox, inbox_id)
    if not inbox:
        raise HTTPException(404, 'Mailbox not found')
    model, key, timestamp = {
        'gmail': (GmailThread, GmailThread.thread_id, 'last_internal_date'),
        'office365': (Office365Thread, Office365Thread.conversation_id, 'last_received_at'),
        'smtp': (SmtpThread, SmtpThread.thread_key, 'last_received_at'),
    }.get(inbox.provider or 'smtp', (None, None, None))
    if model is None:
        raise HTTPException(404, 'Conversation not found')
    thread = await db.scalar(select(model).where(model.inbox_id == inbox_id, key == thread_id).with_for_update())
    if thread is None:
        raise HTTPException(404, 'Conversation not found')
    row = await db.get(ConversationState, (inbox_id, thread_id))
    if folder == 'inbox':
        if row:
            await db.delete(row)
    else:
        if row is None:
            row = ConversationState(inbox_id=inbox_id, thread_id=thread_id)
            db.add(row)
        row.folder = folder
        row.message_watermark = stamp(getattr(thread, timestamp))
        row.updated_at = utcnow()
    await db.flush()
    return {'ok': True, 'inbox_id': inbox_id, 'thread_id': thread_id, 'folder': folder}
