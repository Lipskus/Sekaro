"""User-defined contact fields exposed as dynamic template variables."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ContactFieldDefinition, Lead
from app.schemas import ContactFieldCreate, ContactFieldResponse, ContactFieldUpdate
from app.template_renderer import SYSTEM_VARIABLES

router = APIRouter(prefix="/api/contact-fields", tags=["contact-fields"])

_KEY_RE = re.compile(r"^[\w]+$", re.UNICODE)
_SYSTEM_KEYS = {item["key"] for item in SYSTEM_VARIABLES}


def _normalise_key(raw: str) -> str:
    key = (raw or "").strip().lower()
    if not key:
        raise HTTPException(400, "Field key is required")
    if len(key) > 64:
        raise HTTPException(400, "Field key must be at most 64 characters")
    if not _KEY_RE.fullmatch(key):
        raise HTTPException(
            400,
            "Field key can contain only letters, numbers and underscores",
        )
    if key in _SYSTEM_KEYS:
        raise HTTPException(409, f"{key} is a reserved system field")
    return key


async def _detected_custom_keys(db: AsyncSession) -> set[str]:
    rows = await db.execute(select(Lead.custom_data))
    keys: set[str] = set()
    for value in rows.scalars().all():
        if isinstance(value, dict):
            for key in value.keys():
                clean = str(key).strip()
                if clean:
                    keys.add(clean)
    return keys


@router.get("", response_model=list[ContactFieldResponse])
async def list_contact_fields(db: AsyncSession = Depends(get_db)):
    rows = await db.execute(
        select(ContactFieldDefinition).order_by(ContactFieldDefinition.label, ContactFieldDefinition.key)
    )
    definitions = rows.scalars().all()
    by_key = {row.key: row for row in definitions}
    detected = await _detected_custom_keys(db)

    out: list[ContactFieldResponse] = [
        ContactFieldResponse(
            id=None,
            key=item["key"],
            label=item["label"],
            system=True,
            defined=True,
            created_at=None,
        )
        for item in SYSTEM_VARIABLES
    ]

    all_custom = sorted(set(by_key) | detected)
    for key in all_custom:
        row = by_key.get(key)
        out.append(
            ContactFieldResponse(
                id=row.id if row else None,
                key=key,
                label=(row.label or key) if row else key,
                system=False,
                defined=row is not None,
                created_at=row.created_at if row else None,
            )
        )
    return out


@router.post("", response_model=ContactFieldResponse)
async def create_contact_field(
    data: ContactFieldCreate,
    db: AsyncSession = Depends(get_db),
):
    key = _normalise_key(data.key)
    existing = await db.execute(
        select(ContactFieldDefinition).where(ContactFieldDefinition.key == key)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(409, "Field key already exists")

    row = ContactFieldDefinition(
        key=key,
        label=(data.label or key).strip()[:255] or key,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ContactFieldResponse(
        id=row.id, key=row.key, label=row.label, system=False, defined=True, created_at=row.created_at
    )


@router.patch("/{field_id}", response_model=ContactFieldResponse)
async def update_contact_field(
    field_id: int,
    data: ContactFieldUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(ContactFieldDefinition, field_id)
    if row is None:
        raise HTTPException(404, "Contact field not found")
    row.label = (data.label or row.key).strip()[:255] or row.key
    await db.commit()
    await db.refresh(row)
    return ContactFieldResponse(
        id=row.id, key=row.key, label=row.label, system=False, defined=True, created_at=row.created_at
    )


@router.delete("/{field_id}")
async def delete_contact_field(field_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(ContactFieldDefinition, field_id)
    if row is None:
        raise HTTPException(404, "Contact field not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True, "id": field_id}
