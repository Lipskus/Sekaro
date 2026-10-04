"""Analytics endpoints — aggregated daily statistics, no row limit."""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.analytics_metrics import date_range, human_reply, attributed_replies
from app.models import Campaign, CampaignLead, EmailClick, EmailLog, EmailOpen, LeadReply

log = logging.getLogger("quickly.analytics")
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/daily")
async def daily_analytics(
    start_date: str = Query(..., description="Inclusive start date YYYY-MM-DD"),
    end_date: str = Query(..., description="Inclusive end date YYYY-MM-DD"),
    campaign_id: Optional[List[int]] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return per-day, per-campaign aggregated stats for the requested range.

    No row limit — result size is bounded by (days × campaigns).
    """
    start, end = date_range(start_date, end_date)

    # campaign name lookup
    camp_stmt = select(Campaign.id, Campaign.name)
    if campaign_id:
        camp_stmt = camp_stmt.where(Campaign.id.in_(campaign_id))
    camp_rows = (await db.execute(camp_stmt)).all()
    campaign_names = {cid: name for cid, name in camp_rows}

    # sent per day per campaign
    sent_stmt = (
        select(
            func.date(EmailLog.sent_at).label("day"),
            EmailLog.campaign_id,
            func.count().label("sent"),
        )
        .where(EmailLog.sent_at >= start, EmailLog.sent_at < end)
        .group_by(func.date(EmailLog.sent_at), EmailLog.campaign_id)
    )
    if campaign_id:
        sent_stmt = sent_stmt.where(EmailLog.campaign_id.in_(campaign_id))

    # opens per day per campaign
    opens_stmt = (
        select(
            func.date(EmailOpen.opened_at).label("day"),
            EmailLog.campaign_id,
            func.count().label("total_opens"),
            func.count(func.distinct(EmailOpen.ip_address)).label("unique_opens"),
        )
        .join(EmailLog, EmailOpen.email_log_id == EmailLog.id)
        .where(EmailOpen.opened_at >= start, EmailOpen.opened_at < end)
        .group_by(func.date(EmailOpen.opened_at), EmailLog.campaign_id)
    )
    if campaign_id:
        opens_stmt = opens_stmt.where(EmailLog.campaign_id.in_(campaign_id))

    # clicks per day per campaign
    clicks_stmt = (
        select(
            func.date(EmailClick.clicked_at).label("day"),
            EmailLog.campaign_id,
            func.count().label("total_clicks"),
            func.count(func.distinct(EmailClick.ip_address)).label("unique_clicks"),
        )
        .join(EmailLog, EmailClick.email_log_id == EmailLog.id)
        .where(EmailClick.clicked_at >= start, EmailClick.clicked_at < end)
        .group_by(func.date(EmailClick.clicked_at), EmailLog.campaign_id)
    )
    if campaign_id:
        clicks_stmt = clicks_stmt.where(EmailLog.campaign_id.in_(campaign_id))

    # replies per day per campaign (excluding OOO and auto-reply)
    replies_stmt = (
        select(
            func.date(LeadReply.replied_at).label("day"),
            LeadReply.campaign_id,
            func.count(func.distinct(LeadReply.lead_id)).label("total_replies"),
        )
        .where(
            LeadReply.replied_at >= start,
            LeadReply.replied_at < end,
            human_reply(),
        )
        .group_by(func.date(LeadReply.replied_at), LeadReply.campaign_id)
    )
    if campaign_id:
        replies_stmt = replies_stmt.where(LeadReply.campaign_id.in_(campaign_id))

    sent_rows    = (await db.execute(sent_stmt)).all()
    opens_rows   = (await db.execute(opens_stmt)).all()
    clicks_rows  = (await db.execute(clicks_stmt)).all()
    replies_rows = (await db.execute(replies_stmt)).all()

    result: dict[tuple, dict] = {}

    def _day_str(day) -> str:
        return day.isoformat() if hasattr(day, "isoformat") else str(day)

    def _ensure(day, cid: int) -> dict:
        k = (_day_str(day), int(cid))
        if k not in result:
            result[k] = {
                "date": k[0],
                "campaign_id": k[1],
                "campaign_name": campaign_names.get(k[1], ""),
                "sent": 0,
                "total_opens": 0,
                "unique_opens": 0,
                "total_clicks": 0,
                "unique_clicks": 0,
                "total_replies": 0,
            }
        return result[k]

    for row in sent_rows:
        _ensure(row.day, row.campaign_id)["sent"] = row.sent
    for row in opens_rows:
        entry = _ensure(row.day, row.campaign_id)
        entry["total_opens"] = row.total_opens
        entry["unique_opens"] = row.unique_opens
    for row in clicks_rows:
        entry = _ensure(row.day, row.campaign_id)
        entry["total_clicks"] = row.total_clicks
        entry["unique_clicks"] = row.unique_clicks
    for row in replies_rows:
        _ensure(row.day, row.campaign_id)["total_replies"] = row.total_replies

    return sorted(result.values(), key=lambda x: (x["date"], x["campaign_id"]))


@router.get("/report")
async def recipient_report(
    start_date: str, end_date: str,
    campaign_id: Optional[List[int]] = Query(None),
    group_by: str = "campaign", field_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Cohort of contacted lead/campaign pairs; see docs/STAGE_3_ANALYTICS.md."""
    import json
    import re
    from app.models import Lead, Inbox
    start, end = date_range(start_date, end_date)
    if group_by not in {"campaign", "inbox", "field"}:
        raise HTTPException(400, "group_by must be campaign, inbox or field")
    if group_by == "field" and (not field_key or not re.fullmatch(r"\w{1,64}", field_key)):
        raise HTTPException(400, "field_key is required (1–64 letters, digits or underscores)")

    replies = attributed_replies().where(LeadReply.replied_at >= start, LeadReply.replied_at < end).subquery()
    responded_ids = select(replies.c.email_log_id).where(replies.c.email_log_id.is_not(None))
    # Aggregate messages before joining metadata: duplicate enrolments cannot inflate sends.
    from sqlalchemy import case
    cohort = (select(EmailLog.lead_id, EmailLog.campaign_id, EmailLog.inbox_id,
                     func.count().label("sent"),
                     func.max(case((EmailLog.id.in_(responded_ids), 1), else_=0)).label("replied"))
              .where(EmailLog.sent_at >= start, EmailLog.sent_at < end))
    if campaign_id:
        cohort = cohort.where(EmailLog.campaign_id.in_(campaign_id))
    cohort = cohort.group_by(EmailLog.lead_id, EmailLog.campaign_id, EmailLog.inbox_id).subquery()
    current_status = (select(CampaignLead.enrollment_status)
                      .where(CampaignLead.lead_id == cohort.c.lead_id,
                             CampaignLead.campaign_id == cohort.c.campaign_id)
                      .order_by(CampaignLead.id.desc()).limit(1).correlate(cohort).scalar_subquery())
    stmt = (select(cohort, Campaign.name, Inbox.email, Lead.custom_data, current_status.label("status"))
            .outerjoin(Campaign, Campaign.id == cohort.c.campaign_id)
            .outerjoin(Inbox, Inbox.id == cohort.c.inbox_id)
            .outerjoin(Lead, Lead.id == cohort.c.lead_id))
    groups = {}
    def bucket(key, label):
        return groups.setdefault(key, {"key": key, "label": label, "sent": 0,
                                      "recipients": set(), "replied": set(), "known": set(),
                                      "bounced": set(), "unsubscribed": set()})
    async for row in await db.stream(stmt):
        pair = (row.lead_id, row.campaign_id)
        if group_by == "campaign":
            key, label = str(row.campaign_id), row.name or str(row.campaign_id)
        elif group_by == "inbox":
            key = str(row.inbox_id) if row.inbox_id is not None else "missing"
            label = row.email
        else:
            value = row.custom_data.get(field_key) if isinstance(row.custom_data, dict) else None
            key = "missing" if value is None or value == "" else json.dumps(value, ensure_ascii=False, sort_keys=True)
            label = None if key == "missing" else (value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True))
        item = bucket(key, label)
        item["sent"] += row.sent
        item["recipients"].add(pair)
        if row.replied:
            item["replied"].add(pair)
        if row.status is not None:
            item["known"].add(pair)
        if row.status in {"bounced", "unsubscribed"}:
            item[row.status].add(pair)
    rows = []
    for item in groups.values():
        n, known = len(item["recipients"]), len(item["known"])
        rows.append({"key": item["key"], "label": item["label"], "sent": item["sent"],
                     "recipients": n, "replied": len(item["replied"]),
                     "reply_rate": round(len(item["replied"]) / n * 100, 2) if n else None,
                     "status_known": known,
                     "bounced": len(item["bounced"]), "unsubscribed": len(item["unsubscribed"]),
                     # Missing current enrolments make these rates incomplete, not zero.
                     "bounce_rate": round(len(item["bounced"]) / n * 100, 2) if n and known == n else None,
                     "unsubscribe_rate": round(len(item["unsubscribed"]) / n * 100, 2) if n and known == n else None})
    return {"start_date": start_date, "end_date": end_date, "timezone": "UTC",
            "group_by": group_by, "field_key": field_key if group_by == "field" else None,
            "recipient_unit": "lead_campaign_pair", "reply_attribution": "last_preceding_send",
            "status_basis": "current", "rows": sorted(rows, key=lambda r: (r["label"] or "", r["key"]))}
