# Archive and Trash in Inbox

Open a thread to use Archive thread or Move to trash. The Archive and Trash tabs
let you find filed conversations and restore them to the main list. Moving a
thread to Trash requires confirmation.

Operations apply to entire threads and are shared by users of the installation.
They do not delete individual messages, CRM history or mail at the provider.
Trash has no automatic emptying or permanent deletion. It does not stop campaigns
or replace the suppression list.

Threads in Archive or Trash are excluded from unread-reply notification counts.
A newer thread activity timestamp returns the conversation to the main list.
Synchronizing the same messages or older history does not change its folder.
A reply draft remains available in the current session after restoring the thread.

The update creates the `conversation_state` table at application startup.
No SMTP, Gmail or Microsoft 365 configuration changes are required.
Standard database backups include folder state.

API: `POST /api/unibox/conversation-folder` accepts `inbox_id`, `thread_id`
and `folder` (`inbox`, `archive`, `trash`). Mail read and write permissions are required.

Feature validation: 59 backend tests, 9 draft/thread-action tests, a frontend build
and 18 fixture views at 390/768/1600 px in light and dark themes.
Tests use local data and do not modify production mailboxes.
