"""Reusable message templates, versions, preview and test-send API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Inbox, Lead, MessageTemplate, MessageTemplateVersion, SmtpAccount
from app.schemas import (
    MessageTemplateCreate,
    MessageTemplateRename,
    MessageTemplateResponse,
    MessageTemplateVersionCreate,
    MessageTemplateVersionResponse,
    TemplatePreviewRequest,
    TemplateTestSendRequest,
)
from app.sender import SendFailure, SendResult, send_email
from app.template_renderer import render_message

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _version_response(row: MessageTemplateVersion) -> MessageTemplateVersionResponse:
    return MessageTemplateVersionResponse.model_validate(row, from_attributes=True)


def _template_response(row: MessageTemplate, *, include_versions: bool = False) -> MessageTemplateResponse:
    versions = list(row.versions or [])
    latest = versions[0] if versions else None
    return MessageTemplateResponse(
        id=row.id,
        name=row.name,
        created_at=row.created_at,
        updated_at=row.updated_at,
        latest_version=_version_response(latest) if latest else None,
        versions=[_version_response(v) for v in versions] if include_versions else [],
    )


async def _get_template(db: AsyncSession, template_id: int) -> MessageTemplate:
    result = await db.execute(
        select(MessageTemplate)
        .options(selectinload(MessageTemplate.versions))
        .where(MessageTemplate.id == template_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Template not found")
    return row


async def _get_lead(db: AsyncSession, lead_id: int | None) -> Lead | None:
    if lead_id is None:
        return None
    lead = await db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "Contact not found")
    return lead


@router.get("", response_model=list[MessageTemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    rows = await db.execute(
        select(MessageTemplate)
        .options(selectinload(MessageTemplate.versions))
        .order_by(MessageTemplate.updated_at.desc(), MessageTemplate.id.desc())
    )
    return [_template_response(row) for row in rows.scalars().unique().all()]


@router.get("/{template_id}", response_model=MessageTemplateResponse)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    return _template_response(await _get_template(db, template_id), include_versions=True)


@router.post("", response_model=MessageTemplateResponse)
async def create_template(
    data: MessageTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    name = data.name.strip()
    existing = await db.execute(
        select(MessageTemplate.id).where(func.lower(MessageTemplate.name) == name.lower()).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(409, "Template name already exists")

    row = MessageTemplate(name=name)
    db.add(row)
    await db.flush()
    version = MessageTemplateVersion(
        template_id=row.id,
        version=1,
        subject=data.subject,
        body=data.body,
        is_html=bool(data.is_html),
    )
    db.add(version)
    await db.commit()
    return _template_response(await _get_template(db, row.id), include_versions=True)


@router.patch("/{template_id}", response_model=MessageTemplateResponse)
async def rename_template(
    template_id: int,
    data: MessageTemplateRename,
    db: AsyncSession = Depends(get_db),
):
    row = await _get_template(db, template_id)
    name = data.name.strip()
    duplicate = await db.execute(
        select(MessageTemplate.id).where(
            func.lower(MessageTemplate.name) == name.lower(),
            MessageTemplate.id != template_id,
        ).limit(1)
    )
    if duplicate.scalar_one_or_none() is not None:
        raise HTTPException(409, "Template name already exists")
    row.name = name
    await db.commit()
    return _template_response(await _get_template(db, template_id), include_versions=True)


@router.post("/{template_id}/versions", response_model=MessageTemplateResponse)
async def create_template_version(
    template_id: int,
    data: MessageTemplateVersionCreate,
    db: AsyncSession = Depends(get_db),
):
    row = await _get_template(db, template_id)
    max_result = await db.execute(
        select(func.max(MessageTemplateVersion.version)).where(
            MessageTemplateVersion.template_id == template_id
        )
    )
    next_version = int(max_result.scalar() or 0) + 1
    db.add(
        MessageTemplateVersion(
            template_id=template_id,
            version=next_version,
            subject=data.subject,
            body=data.body,
            is_html=bool(data.is_html),
        )
    )
    row.updated_at = __import__("app.time", fromlist=["utcnow"]).utcnow()
    await db.commit()
    return _template_response(await _get_template(db, template_id), include_versions=True)


@router.delete("/{template_id}")
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(MessageTemplate, template_id)
    if row is None:
        raise HTTPException(404, "Template not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True, "id": template_id}


@router.post("/preview/render")
async def preview_template(
    data: TemplatePreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead(db, data.lead_id)
    return render_message(
        subject=data.subject,
        body=data.body,
        is_html=data.is_html,
        lead=lead,
    )


@router.post("/actions/test-send")
async def test_send_template(
    data: TemplateTestSendRequest,
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead(db, data.lead_id)
    rendered = render_message(
        subject=data.subject,
        body=data.body,
        is_html=data.is_html,
        lead=lead,
    )
    if rendered["missing_variables"]:
        raise HTTPException(
            400,
            detail={
                "message": "Template has variables without values",
                "missing_variables": rendered["missing_variables"],
            },
        )

    inbox = await db.get(Inbox, data.inbox_id)
    if inbox is None:
        raise HTTPException(404, "Inbox not found")
    if (inbox.provider or "smtp") != "smtp":
        raise HTTPException(400, "Sekaro 0.4 test send requires an SMTP inbox")
    if inbox.paused:
        raise HTTPException(400, "Inbox is paused")

    account_result = await db.execute(
        select(SmtpAccount).where(SmtpAccount.inbox_id == inbox.id)
    )
    account = account_result.scalar_one_or_none()
    if account is None:
        raise HTTPException(400, "SMTP account is not configured")

    result = send_email(
        to_email=str(data.to_email),
        subject=rendered["subject"],
        body=rendered["body"],
        from_email=inbox.email,
        from_name=inbox.display_name or "",
        reply_to_address=inbox.reply_to or None,
        is_html=bool(data.is_html),
        provider="smtp",
        smtp_account=account,
    )
    if isinstance(result, SendFailure):
        raise HTTPException(502, f"Test send failed: {result.message}")
    if not isinstance(result, SendResult):
        raise HTTPException(502, "Test send failed")

    return {
        "ok": True,
        "message_id": result.message_id,
        "to_email": str(data.to_email),
        "subject": rendered["subject"],
    }
