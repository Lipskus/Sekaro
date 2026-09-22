"""Sekaro 0.3 contact import and suppression tests."""
from io import BytesIO
import json

import pytest
from fastapi import UploadFile
from sqlalchemy import select

from app.contact_import import (
    apply_mapping,
    parse_contact_file,
    suggest_mapping,
    validate_mapping,
)
from app.models import ContactList, ContactListMember, Lead, SuppressionEntry
from app.suppression import is_suppressed, suppress_email
from app.routers.leads import import_contacts_file
from tests.conftest import make_campaign, make_campaign_lead, make_inbox, make_lead, make_sequence


def test_csv_import_detects_polish_headers_and_custom_fields():
    raw = (
        "Adres e-mail;Nazwa;Land;Lokalizacja\n"
        "kontakt@marina.de;Marina Nord;Schleswig-Holstein;Kiel\n"
    ).encode("utf-8")

    table = parse_contact_file("mariny.csv", raw)
    mapping = suggest_mapping(table.headers)

    assert mapping["Adres e-mail"] == "email"
    assert mapping["Nazwa"] == "name"
    assert mapping["Land"] == "custom:land"
    assert mapping["Lokalizacja"] == "custom:lokalizacja"

    email, name, custom = apply_mapping(table.rows[0], mapping)
    assert email == "kontakt@marina.de"
    assert name == "Marina Nord"
    assert custom == {
        "land": "Schleswig-Holstein",
        "lokalizacja": "Kiel",
    }


def test_csv_import_supports_cp1250_and_semicolon():
    raw = (
        "E-mail;Nazwa;Miejscowość\n"
        "biuro@example.pl;Żeglarska Marina;Szczecin\n"
    ).encode("cp1250")

    table = parse_contact_file("kontakty.csv", raw)
    assert table.rows[0]["Nazwa"] == "Żeglarska Marina"
    assert table.rows[0]["Miejscowość"] == "Szczecin"


def test_xlsx_import_reads_first_sheet():
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Mariny"
    ws.append(["Email", "Name", "Region"])
    ws.append(["office@example.de", "Test Marina", "Hamburg"])
    buf = BytesIO()
    wb.save(buf)

    table = parse_contact_file("mariny.xlsx", buf.getvalue())

    assert table.sheet_name == "Mariny"
    assert table.headers == ["Email", "Name", "Region"]
    assert table.rows[0]["Email"] == "office@example.de"


def test_mapping_requires_exactly_one_email_column():
    headers = ["Mail 1", "Mail 2", "Name"]
    with pytest.raises(ValueError, match="Exactly one"):
        validate_mapping(
            headers,
            {
                "Mail 1": "email",
                "Mail 2": "email",
                "Name": "name",
            },
        )


@pytest.mark.asyncio
async def test_suppression_normalizes_email_and_is_idempotent(session):
    first = await suppress_email(
        session,
        "  CONTACT@Example.COM ",
        reason="manual",
        source="test",
        stop_active_sends=False,
    )
    second = await suppress_email(
        session,
        "contact@example.com",
        reason="manual",
        source="test",
        stop_active_sends=False,
    )
    await session.flush()

    assert first.id == second.id
    assert first.email == "contact@example.com"
    assert await is_suppressed(session, "CONTACT@example.com") is True

    rows = await session.execute(select(SuppressionEntry))
    assert len(rows.scalars().all()) == 1


@pytest.mark.asyncio
async def test_suppression_pauses_matching_contact_enrollments(session):
    """Suppression must stop an enrolled contact before the sender sees it."""
    campaign = await make_campaign(session, name="Suppression campaign")
    _inbox = await make_inbox(session, email="sender@example.com", provider="smtp")
    _sequence = await make_sequence(session, campaign_id=campaign.id, position=0)
    lead = await make_lead(session, email="blocked@example.com")
    cl = await make_campaign_lead(session, campaign_id=campaign.id, lead_id=lead.id)

    await suppress_email(
        session,
        lead.email,
        reason="unsubscribe",
        source="test",
        stop_active_sends=True,
    )
    await session.flush()

    assert cl.sending_paused is True
    assert cl.enrollment_status == "unsubscribed"


@pytest.mark.asyncio
async def test_global_contact_import_merges_custom_fields_lists_and_suppression(session):
    await suppress_email(
        session,
        "blocked@example.com",
        reason="manual",
        source="test",
        stop_active_sends=False,
    )
    await session.flush()

    raw = (
        "Email;Nazwa;Land;Miasto\n"
        "office@marina.de;Marina A;Hamburg;Hamburg\n"
        "blocked@example.com;Blocked Marina;Berlin;Berlin\n"
        "office@marina.de;Duplicate Row;SH;Kiel\n"
    ).encode("utf-8")

    upload = UploadFile(filename="mariny-niemcy.csv", file=BytesIO(raw))
    mapping = {
        "Email": "email",
        "Nazwa": "name",
        "Land": "custom:land",
        "Miasto": "custom:miasto",
    }

    result = await import_contacts_file(
        file=upload,
        mapping_json=json.dumps(mapping),
        duplicate_mode="merge",
        list_name="Mariny Niemcy",
        db=session,
    )

    assert result["added"] == 1
    assert result["skipped_suppressed"] == 1
    assert result["duplicates_in_file"] == 1
    assert result["list"]["name"] == "Mariny Niemcy"
    assert result["list_members_added"] == 1

    lead_res = await session.execute(
        select(Lead).where(Lead.email == "office@marina.de")
    )
    lead = lead_res.scalar_one()
    assert lead.name == "Marina A"
    assert lead.custom_data == {"land": "Hamburg", "miasto": "Hamburg"}

    list_res = await session.execute(
        select(ContactList).where(ContactList.name == "Mariny Niemcy")
    )
    contact_list = list_res.scalar_one()

    member_res = await session.execute(
        select(ContactListMember).where(
            ContactListMember.list_id == contact_list.id,
            ContactListMember.lead_id == lead.id,
        )
    )
    assert member_res.scalar_one_or_none() is not None

    second_raw = (
        "Email;Nazwa;Land;Miasto\n"
        "office@marina.de;Marina A Updated;Schleswig-Holstein;Kiel\n"
    ).encode("utf-8")
    second_upload = UploadFile(filename="update.csv", file=BytesIO(second_raw))
    second = await import_contacts_file(
        file=second_upload,
        mapping_json=json.dumps(mapping),
        duplicate_mode="merge",
        list_name="Mariny Niemcy",
        db=session,
    )

    assert second["added"] == 0
    assert second["updated"] == 1
    assert second["list_members_added"] == 0

    refreshed = (
        await session.execute(select(Lead).where(Lead.id == lead.id))
    ).scalar_one()
    assert refreshed.name == "Marina A Updated"
    assert refreshed.custom_data["land"] == "Schleswig-Holstein"
    assert refreshed.custom_data["miasto"] == "Kiel"
