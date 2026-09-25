"""Deterministic fictional records, inserted atomically into an empty demo database."""
import json
from datetime import datetime, timedelta

from sqlalchemy import select, func

from app.auth import hash_password
from app.database import Base
from app.models import (
    AppSetting, User, Inbox, SmtpAccount, SmtpSyncState, Lead, ContactFieldDefinition,
    ContactList, ContactListMember, Campaign, CampaignInbox, CampaignLead, Sequence,
    QueueSlot, EmailLog, EmailOpen, EmailClick, LeadReply, SuppressionEntry,
    MessageTemplate, MessageTemplateVersion, SmtpThread, SmtpMessage, Notification,
)

MARKER = "sekaro.demo.dataset.v1"


async def seed_demo(db, password: str, now: datetime | None = None):
    """Caller owns the transaction. Never overwrite edits or seed a non-empty DB."""
    marker = await db.get(AppSetting, MARKER)
    if marker:
        return json.loads(marker.value)
    if len(password) < 20:
        raise ValueError("Demo admin password must contain at least 20 characters")
    for table in Base.metadata.sorted_tables:
        if table.name != "app_setting" and (await db.execute(select(func.count()).select_from(table))).scalar():
            raise ValueError("Refusing to seed a non-empty database")

    now = (now or datetime.utcnow()).replace(microsecond=0)
    today = now.replace(hour=0, minute=0, second=0)
    user = User(username="demo", email="admin@sekaro-demo.invalid", role="admin",
                password_hash=hash_password(password), is_active=True)
    db.add(user)
    await db.flush()
    for key, label in [("company", "Firma"), ("region", "Region"), ("country", "Kraj"),
                       ("phone", "Telefon"), ("priority", "Priorytet")]:
        db.add(ContactFieldDefinition(key=key, label=label))

    inboxes = []
    for i, name in enumerate(["DEMO · Sprzedaż", "DEMO · Partnerzy", "DEMO · Rozgrzewanie"]):
        inbox = Inbox(email=f"skrzynka{i + 1}@sekaro-demo.invalid", display_name=name,
                      provider="smtp", max_emails_per_day=[100, 75, 30][i], max_emails_per_hour=10,
                      paused=i == 1, ramp_up_enabled=i == 2, ramp_up_start=5, ramp_up_step_size=2,
                      ramp_up_started_at=today - timedelta(days=4), created_at=today - timedelta(days=45))
        db.add(inbox)
        await db.flush()
        # No credentials. Test/health state below is explicitly synthetic demo data.
        db.add(SmtpAccount(inbox_id=inbox.id, smtp_host="smtp.sekaro-demo.invalid",
                           smtp_username=inbox.email, smtp_password="", imap_host="imap.sekaro-demo.invalid",
                           imap_username=inbox.email, imap_password="", last_tested_at=now,
                           last_test_ok=i != 1, last_test_error="DEMO: błąd połączenia IMAP" if i == 1 else ""))
        db.add(SmtpSyncState(inbox_id=inbox.id, last_sync_at=now - timedelta(minutes=5 + i)))
        inboxes.append(inbox)

    campaigns = []
    for i, name in enumerate(["DEMO · Mariny Bałtyk", "DEMO · Partnerzy DACH", "DEMO · Wstrzymana",
                              "DEMO · Zakończona", "DEMO · Szkic", "DEMO · Treści do uzupełnienia"]):
        campaign = Campaign(name=name, paused=i == 2, priority=i, timezone="Europe/Warsaw",
                            sending_days=[0, 1, 2, 3, 4], created_at=today - timedelta(days=35 - i * 4))
        db.add(campaign)
        await db.flush()
        db.add(CampaignInbox(campaign_id=campaign.id, inbox_id=inboxes[i % 3].id, position=0))
        for step in range(3):
            db.add(Sequence(campaign_id=campaign.id, position=step,
                            subject="DEMO · Rozmowa z {{company}}" if step == 0 else "DEMO · Kolejny kontakt",
                            body="Dzień dobry {{name}},\nTo fikcyjna wiadomość demonstracyjna dla {{company}}.\nPozdrawiamy, zespół DEMO",
                            is_html=False, wait_days_after_previous=step * 2,
                            sequence_type="personalized" if i == 5 else "standard"))
        campaigns.append(campaign)

    lists = []
    for name in ["DEMO · Polska", "DEMO · Niemcy", "DEMO · Dania"]:
        group = ContactList(name=name)
        db.add(group)
        await db.flush()
        lists.append(group)

    leads = []
    for i in range(60):
        status = ["replied", "replied", "bounced", "unsubscribed"][(i % 12)] if i % 12 < 4 else "active"
        lead = Lead(email=f"kontakt{i + 1:02d}@sekaro-demo.invalid", name=f"Kontakt Demo {i + 1:02d}", status=status,
                    email_verification_status="invalid" if status == "bounced" else "valid",
                    custom_data={"company": f"Marina Demo {i + 1:02d}", "region": ["Bałtyk", "Meklemburgia", "Jutlandia"][i % 3],
                                 "country": ["PL", "DE", "DK"][i % 3], "phone": "DEMO — brak numeru", "priority": str(i % 3 + 1)},
                    created_at=today - timedelta(days=32 - i % 30))
        db.add(lead)
        await db.flush()
        ci = i // 12 if i < 48 else 5
        enrollment = CampaignLead(campaign_id=campaigns[ci].id, lead_id=lead.id,
                                  enrollment_status="completed" if ci == 3 else status,
                                  interest_status="interested" if status == "replied" else None,
                                  enrolled_at=today - timedelta(days=30))
        db.add(enrollment)
        await db.flush()
        db.add(ContactListMember(list_id=lists[i % 3].id, lead_id=lead.id))
        if status == "unsubscribed":
            db.add(SuppressionEntry(email=lead.email, reason="unsubscribe", source="demo", note="Fikcyjne wypisanie"))
        if status == "replied":
            db.add(LeadReply(lead_id=lead.id, campaign_id=campaigns[ci].id, replied_at=now - timedelta(days=i % 5)))
        if ci in (0, 1, 2) and status == "active":
            for step in (1, 2):
                db.add(QueueSlot(campaign_lead_id=enrollment.id, inbox_id=inboxes[ci % 3].id,
                                 sequence_index=step, scheduled_date=today + timedelta(days=(i + step) % 7,
                                                                                     hours=8 + i % 8, minutes=(i * 7) % 60),
                                 position_in_day=i * 2 + step))
        leads.append(lead)

    # Daily activity across a full month. These are stored records, never sent messages.
    logs = 0
    for day in range(30):
        for offset in range(2 + day % 5):
            i = (day * 3 + offset) % 48
            ci = i // 12
            when = min(today - timedelta(days=day) + timedelta(hours=7 + offset), now - timedelta(minutes=5))
            entry = EmailLog(lead_id=leads[i].id, campaign_id=campaigns[ci].id,
                             inbox_id=inboxes[i % 3 if i < 12 else ci % 3].id, sequence_index=0,
                             thread_id=f"<demo-thread-{i}@sekaro-demo.invalid>" if i < 12 else None,
                             subject=f"DEMO · Rozmowa z Marina Demo {i + 1:02d}", sent_at=when,
                             opened=offset % 2 == 0, clicked=offset % 3 == 0,
                             message_id=f"<demo-log-{day}-{offset}@sekaro-demo.invalid>")
            db.add(entry)
            await db.flush()
            if entry.opened:
                db.add(EmailOpen(email_log_id=entry.id, opened_at=when + timedelta(minutes=1),
                                 ip_address=f"192.0.2.{i + 1}"))
            if entry.clicked:
                db.add(EmailClick(email_log_id=entry.id, clicked_at=when + timedelta(minutes=2),
                                  ip_address=f"192.0.2.{i + 1}"))
            logs += 1

    for i in range(12):
        inbox, lead = inboxes[i % 3], leads[i]
        key = f"<demo-thread-{i}@sekaro-demo.invalid>"
        when = now - timedelta(hours=i + 1)
        db.add(SmtpThread(inbox_id=inbox.id, thread_key=key, subject=f"DEMO · Rozmowa {i + 1}",
                          last_received_at=when, is_lead_thread=True, unread_lead_reply=i % 2 == 0))
        await db.flush()
        for j in range(3):
            inbound = j == 1 or (j == 2 and i % 2 == 0)
            db.add(SmtpMessage(inbox_id=inbox.id, thread_key=key, message_id=f"demo-message-{i}-{j}",
                               rfc_message_id=f"<demo-message-{i}-{j}@sekaro-demo.invalid>",
                               subject=f"DEMO · Rozmowa {i + 1}", direction="received" if inbound else "sent",
                               from_address=lead.email if inbound else inbox.email,
                               to_addresses=json.dumps([inbox.email if inbound else lead.email]),
                               body_plain="Dziękuję za wiadomość. Chętnie poznam szczegóły. [Rozmowa demonstracyjna]" if inbound else
                                          "Dzień dobry, prezentujemy fikcyjną ofertę dla mariny. [Wiadomość demonstracyjna]",
                               received_at=when - timedelta(minutes=(2 - j) * 15), is_read=i % 2 != 0))

    for i, name in enumerate(["Pierwszy kontakt", "Follow-up", "Prezentacja HTML", "Podziękowanie"]):
        template = MessageTemplate(name=f"DEMO · {name}")
        db.add(template)
        await db.flush()
        for version in range(1, 4):
            body = f"Dzień dobry {{{{name}}}},\nTo wersja {version} przykładowego szablonu dla {{{{company}}}}."
            db.add(MessageTemplateVersion(template_id=template.id, version=version,
                                          subject=f"DEMO · {name} — {{{{company}}}}", body=f"<p>{body}</p>" if i == 2 else body,
                                          is_html=i == 2, created_at=now - timedelta(days=4 - version)))
    for i in range(12):
        kind, title = [("lead_replied", "Nowa odpowiedź kontaktu"), ("email_bounced", "Wiadomość odbita"),
                       ("rate_limit", "Osiągnięto limit skrzynki"), ("lead_unsubscribed", "Kontakt wypisany")][i % 4]
        db.add(Notification(user_id=user.id, event_type=kind, title=f"DEMO · {title}",
                            message="To syntetyczne zdarzenie do kontroli interfejsu. Nie wykonano rzeczywistej wysyłki.",
                            lead_id=leads[i].id, campaign_id=campaigns[i % 3].id, inbox_id=inboxes[i % 3].id,
                            created_at=now - timedelta(hours=i), read_at=now if i % 3 == 0 else None))
    summary = {"version": 1, "created_at": now.isoformat(), "contacts": 60, "campaigns": 6,
               "inboxes": 3, "templates": 4, "threads": 12, "messages": 36,
               "notifications": 12, "historical_sends": logs, "activity_days": 30}
    db.add(AppSetting(key=MARKER, value=json.dumps(summary)))
    await db.flush()
    return summary
