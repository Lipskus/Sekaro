"""Universal contact fields and presentation metadata. Never seeds business fields."""
from __future__ import annotations
import json
import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import AppSetting, ContactFieldDefinition, Lead
from app.schemas import ContactFieldCreate, ContactFieldResponse, ContactFieldUpdate
from app.template_renderer import SYSTEM_VARIABLES

router = APIRouter(prefix="/api/contact-fields", tags=["contact-fields"])
_KEY_RE = re.compile(r"^[\w]+$", re.UNICODE)
_SYSTEM_KEYS = {item["key"] for item in SYSTEM_VARIABLES} | {"unsubscribe_link"}
_META_PREFIX = "sekaro.contact_field."
FieldType = Literal["text", "textarea", "number", "date", "select"]

class FieldCreate(ContactFieldCreate):
    field_type: FieldType = "text"
    options: list[str] = Field(default_factory=list, max_length=200)

class FieldUpdate(ContactFieldUpdate):
    field_type: FieldType | None = None
    options: list[str] | None = Field(default=None, max_length=200)

class FieldResponse(ContactFieldResponse):
    field_type: FieldType = "text"
    options: list[str] = Field(default_factory=list)

def _normalise_key(raw: str) -> str:
    key = (raw or "").strip().lower()
    if not key or len(key) > 64 or not _KEY_RE.fullmatch(key):
        raise HTTPException(400, "Klucz pola: od 1 do 64 liter, cyfr lub podkreśleń.")
    if key in _SYSTEM_KEYS:
        raise HTTPException(409, f"{key} jest zarezerwowanym polem systemowym.")
    return key

def _metadata(field_type="text", options=None):
    if field_type not in {"text", "textarea", "number", "date", "select"}:
        raise HTTPException(400, "Niepoprawny typ pola.")
    clean = list(dict.fromkeys(str(v).strip() for v in (options or []) if str(v).strip()))
    if len(clean) > 200 or any(len(v) > 255 for v in clean):
        raise HTTPException(400, "Lista może zawierać maksymalnie 200 opcji, po 255 znaków.")
    if field_type == "select" and not clean:
        raise HTTPException(400, "Dodaj przynajmniej jedną opcję listy.")
    return {"field_type": field_type, "options": clean if field_type == "select" else []}

def _read_metadata(value):
    try:
        data=json.loads(value)
        return _metadata(data.get("field_type", "text"), data.get("options", []))
    except (ValueError, TypeError, AttributeError, HTTPException):
        return {"field_type":"text", "options":[]}

async def _detected_custom_keys(db: AsyncSession) -> set[str]:
    keys=set()
    result=await db.stream_scalars(select(Lead.custom_data))
    async for value in result:
        if isinstance(value,dict):
            keys.update(str(k) for k in value if str(k).strip() and str(k) not in _SYSTEM_KEYS)
    return keys

async def _store_metadata(db, key, meta):
    setting=await db.get(AppSetting, _META_PREFIX+key)
    if setting is None:
        db.add(AppSetting(key=_META_PREFIX+key,value=json.dumps(meta,ensure_ascii=False)))
    else:
        setting.value=json.dumps(meta,ensure_ascii=False)

def _response(row, meta=None):
    return FieldResponse(id=row.id,key=row.key,label=row.label or row.key,system=False,defined=True,created_at=row.created_at,**(meta or {}))

@router.get("", response_model=list[FieldResponse])
async def list_contact_fields(db: AsyncSession = Depends(get_db)):
    definitions=(await db.execute(select(ContactFieldDefinition).order_by(ContactFieldDefinition.label,ContactFieldDefinition.key))).scalars().all()
    by_key={row.key:row for row in definitions}
    detected=await _detected_custom_keys(db)
    settings=(await db.execute(select(AppSetting).where(AppSetting.key.startswith(_META_PREFIX)))).scalars().all()
    metas={s.key[len(_META_PREFIX):]:_read_metadata(s.value) for s in settings}
    out=[FieldResponse(id=None,key=x["key"],label=x["label"],system=True,defined=True) for x in SYSTEM_VARIABLES]
    for key in sorted((set(by_key)|detected)-_SYSTEM_KEYS):
        row=by_key.get(key)
        out.append(_response(row,metas.get(key)) if row else FieldResponse(key=key,label=key,system=False,defined=False,**metas.get(key,{})))
    return out

@router.post("", response_model=FieldResponse)
async def create_contact_field(data: FieldCreate, db: AsyncSession = Depends(get_db)):
    key=_normalise_key(data.key)
    existing=(await db.execute(select(ContactFieldDefinition).where(ContactFieldDefinition.key==key))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409,"Pole o takim kluczu już istnieje.")
    meta=_metadata(getattr(data,"field_type","text"),getattr(data,"options",[]))
    row=ContactFieldDefinition(key=key,label=(data.label or key).strip() or key)
    db.add(row)
    await _store_metadata(db,key,meta)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409,"Pole o takim kluczu już istnieje.") from exc
    await db.refresh(row)
    return _response(row,meta)

@router.patch("/{field_id}", response_model=FieldResponse)
async def update_contact_field(field_id: int, data: FieldUpdate, db: AsyncSession = Depends(get_db)):
    row=await db.get(ContactFieldDefinition,field_id)
    if row is None: raise HTTPException(404,"Nie znaleziono pola.")
    setting=await db.get(AppSetting,_META_PREFIX+row.key)
    old=_read_metadata(setting.value) if setting else {"field_type":"text","options":[]}
    field_type=getattr(data,"field_type",None) or old["field_type"]
    options=getattr(data,"options",None)
    meta=_metadata(field_type,old["options"] if options is None else options)
    row.label=(data.label or row.key).strip() or row.key
    await _store_metadata(db,row.key,meta)
    await db.commit();await db.refresh(row)
    return _response(row,meta)

@router.delete("/{field_id}")
async def delete_contact_field(field_id: int, purge: bool = Query(False), db: AsyncSession = Depends(get_db)):
    """Default preserves values. purge=true requires an explicit UI confirmation."""
    # Direct Python callers from older tests do not receive FastAPI injection.
    purge = purge is True
    row=await db.get(ContactFieldDefinition,field_id)
    if row is None: raise HTTPException(404,"Nie znaleziono pola.")
    key=row.key
    affected=0
    if purge:
        leads=await db.stream_scalars(select(Lead).execution_options(yield_per=500))
        async for lead in leads:
            if isinstance(lead.custom_data,dict) and key in lead.custom_data:
                lead.custom_data={k:v for k,v in lead.custom_data.items() if k!=key}
                affected+=1
                if affected%500==0: await db.flush()
    setting=await db.get(AppSetting,_META_PREFIX+key)
    if setting is not None: await db.delete(setting)
    await db.delete(row);await db.commit()
    return {"ok":True,"id":field_id,"purged":purge,"affected_contacts":affected}
