"""Provider boundary shared by delivery and mailbox synchronization.

Transport implementations stay in sender/unibox; lazy imports prevent cycles.
SMTP, Gmail and Microsoft 365 use their existing transport implementations.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class MailAdapter:
    name: str
    remote_retention: bool = False

    def send(self, **message):
        from app import sender
        transport = {"smtp": sender._send_via_smtp, "gmail": sender._send_via_gmail,
                     "office365": sender._send_via_office365}[self.name]
        return transport(**message)

    async def sync(self, db, inbox, reason):
        from app import unibox
        if self.name == 'gmail':
            return await unibox._sync_inbox(db, inbox, reason)
        handler = unibox._sync_inbox_smtp if self.name == 'smtp' else unibox._sync_inbox_office365
        return await handler(db, inbox, reason), set()

ADAPTERS = {name: MailAdapter(name, name == 'smtp') for name in ('smtp', 'gmail', 'office365')}

def get_adapter(provider):
    try:
        return ADAPTERS[provider or 'smtp']
    except (KeyError, TypeError):
        raise ValueError('Unsupported mail provider') from None
