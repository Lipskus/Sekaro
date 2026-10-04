"""Shared measurement rules. Timestamps in the database are naive UTC."""
from datetime import datetime, timedelta
import re
from fastapi import HTTPException
from sqlalchemy import select, or_
from app.models import CampaignLead, EmailLog, LeadReply


def date_range(start_date, end_date):
    try:
        if not all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) for v in (start_date, end_date)):
            raise ValueError
        start, last = (datetime.strptime(v, "%Y-%m-%d") for v in (start_date, end_date))
        if not 0 <= (last - start).days < 366:
            raise ValueError
        return start, last + timedelta(days=1)
    except (ValueError, OverflowError):
        raise HTTPException(400, "Use a valid inclusive UTC date range of 1–366 days (YYYY-MM-DD).")


def latest_interest():
    # A scalar lookup avoids multiplying replies if legacy enrolments are duplicated.
    return (select(CampaignLead.interest_status)
            .where(CampaignLead.lead_id == LeadReply.lead_id,
                   CampaignLead.campaign_id == LeadReply.campaign_id)
            .order_by(CampaignLead.id.desc()).limit(1).correlate(LeadReply).scalar_subquery())


def human_reply():
    interest = latest_interest()
    return or_(interest.is_(None), interest.notin_(["out_of_office", "auto_reply"]))


def attributed_replies():
    """Heuristic: attribute a reply to the last preceding send in its campaign.

    Exact thread/mailbox attribution is unavailable in LeadReply. Tie-break by id.
    Callers may filter the returned send ids, never the candidate sends first.
    """
    last_send = (select(EmailLog.id)
                 .where(EmailLog.lead_id == LeadReply.lead_id,
                        EmailLog.campaign_id == LeadReply.campaign_id,
                        EmailLog.sent_at <= LeadReply.replied_at)
                 .order_by(EmailLog.sent_at.desc(), EmailLog.id.desc())
                 .limit(1).correlate(LeadReply).scalar_subquery())
    return select(LeadReply.lead_id, LeadReply.campaign_id,
                  LeadReply.replied_at, last_send.label("email_log_id")).where(human_reply())
