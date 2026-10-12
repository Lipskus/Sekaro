from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from app.mail_adapters import get_adapter
from app.sender import send_email, SendFailure
from app.settings_manager import settings

@pytest.mark.parametrize('test_mode',[True,False])
def test_unknown_provider_never_falls_back_or_simulates(monkeypatch,test_mode):
    monkeypatch.setattr(settings,'test_mode',test_mode)
    result=send_email('to@example.com','subject','body','from@example.com',provider='typo')
    assert isinstance(result,SendFailure) and result.error_type=='unsupported_provider'

@pytest.mark.asyncio
@pytest.mark.parametrize('provider',['gmail','smtp','office365'])
async def test_adapter_sync_contract(monkeypatch,provider):
    from app import unibox
    touched={(1,'thread')};hydration={'thread'} if provider=='gmail' else set()
    name={'gmail':'_sync_inbox','smtp':'_sync_inbox_smtp','office365':'_sync_inbox_office365'}[provider]
    handler=AsyncMock(return_value=(touched,hydration) if provider=='gmail' else touched)
    monkeypatch.setattr(unibox,name,handler)
    assert await get_adapter(provider).sync(None,SimpleNamespace(id=1),'test')==(touched,hydration)
    assert get_adapter(provider).remote_retention==(provider=='smtp')

@pytest.mark.parametrize('provider',['gmail','smtp','office365'])
def test_send_dispatches_only_selected_transport(monkeypatch,provider):
    from app import sender
    from unittest.mock import Mock
    selected=Mock(return_value='result')
    for name in ('gmail','smtp','office365'):
        monkeypatch.setattr(sender,'_send_via_'+name,selected if name==provider else Mock(side_effect=AssertionError('Wrong transport')))
    assert get_adapter(provider).send(subject='subject')=='result'
    selected.assert_called_once_with(subject='subject')

@pytest.mark.asyncio
async def test_legacy_credentials_encrypted_idempotently(session,monkeypatch):
    from app import security
    from app.models import Inbox
    from app.mail_credentials_migration import migrate_mail_credentials
    from sqlalchemy import text
    old=security._fernet
    monkeypatch.setattr(security,'_fernet',old)
    security.init_encryption('migration-test-key')
    inbox=Inbox(email='legacy@example.com',provider='gmail');session.add(inbox);await session.flush()
    await session.execute(text('INSERT INTO gmail_account (inbox_id,google_email,access_token,refresh_token) VALUES (:id,:email,:access,:refresh)'),
        {'id':inbox.id,'email':inbox.email,'access':'old-access','refresh':'old-refresh'})
    conn=await session.connection()
    assert await migrate_mail_credentials(conn)==2
    row=(await session.execute(text('SELECT access_token,refresh_token FROM gmail_account'))).one()
    assert security.decrypt(row[0])=='old-access' and security.decrypt(row[1])=='old-refresh'
    assert await migrate_mail_credentials(conn)==0
