"""On-demand DNS observations, not a delivery/reputation score."""
import asyncio
import ipaddress
import os
import re
from datetime import datetime, timezone

import dns.asyncresolver
import dns.exception
import dns.resolver
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Inbox, SmtpAccount, SmtpSyncState

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


class DomainCheck(BaseModel):
    selector: str = Field(default="", max_length=253)
    sending_ipv4: str = Field(default="", max_length=45)


def domain_name(value):
    try:
        value = value.rstrip(".").lower().encode("idna").decode("ascii")
    except UnicodeError:
        raise HTTPException(400, "Invalid domain")
    if len(value) > 253 or "." not in value or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in value.split(".")):
        raise HTTPException(400, "Invalid domain")
    return value


async def dns_query(name, kind):
    try:
        answer = await dns.asyncresolver.resolve(name + ".", kind, lifetime=4, search=False)
        values = [b"".join(r.strings).decode("utf-8", errors="replace") if kind == "TXT" else r.to_text() for r in answer]
        return {"state": "observed", "records": values, "query": name, "type": kind}
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return {"state": "missing", "records": [], "query": name, "type": kind}
    except dns.exception.DNSException:
        return {"state": "error", "records": [], "query": name, "type": kind}


def txt_result(result, prefix, *, dkim=False):
    if result["state"] not in {"observed", "missing"}:
        return result
    records = [r for r in result["records"] if (re.search(r"(?:^|;)\s*p\s*=", r, re.I) if dkim else re.match(re.escape(prefix) + r"(?:[ ;]|$)", r, re.I))]
    result = {**result, "records": records}
    if not records:
        result["state"] = "missing"
    elif len(records) != 1:
        result["state"] = "invalid"
    elif dkim and re.search(r"(?:^|;)\s*p\s*=\s*(?:;|$)", records[0]):
        result["state"] = "revoked"
    else:
        # Presence only. No SPF evaluation, DKIM signature or DMARC alignment claim.
        result["state"] = "present"
    return result


ZEN_CODES = {f"127.0.0.{n}" for n in (2, 3, 4, 9, 10, 11)}


async def blacklist_check(ip):
    # A control lookup guards against resolvers returning NXDOMAIN for all DNSBL queries.
    probe = await dns_query("2.0.0.127.zen.spamhaus.org", "A")
    if probe["state"] != "observed" or not probe["records"] or not set(probe["records"]) <= ZEN_CODES:
        return {"state": "error", "records": [], "source": "Spamhaus ZEN"}
    result = await dns_query(".".join(reversed(ip.split("."))) + ".zen.spamhaus.org", "A")
    if result["state"] == "missing":
        result["state"] = "not_listed"
    elif result["state"] == "observed":
        result["state"] = "listed" if result["records"] and set(result["records"]) <= ZEN_CODES else "error"
    return {**result, "source": "Spamhaus ZEN"}


@router.post("/domains/{domain}")
async def check_domain(domain: str, data: DomainCheck, request: Request, db: AsyncSession = Depends(get_db)):
    domain = domain_name(domain)
    configured = set()
    for email in (await db.execute(select(Inbox.email))).scalars():
        try:
            configured.add(domain_name(email.rsplit("@", 1)[-1]))
        except HTTPException:
            pass
    if domain not in configured:
        raise HTTPException(404, "Domain is not used by a configured inbox")
    if getattr(request.app.state, "is_demo", False) or os.getenv("SEKARO_DEMO_MODE") == "1":
        raise HTTPException(403, "Network diagnostics are disabled in demo")
    selector = data.selector.strip()
    if selector and (len(selector + "._domainkey." + domain) > 253 or not all(re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_-]{0,62}", label) for label in selector.split("."))):
        raise HTTPException(400, "Invalid DKIM selector")
    ip = data.sending_ipv4.strip()
    if ip:
        try:
            address = ipaddress.IPv4Address(ip)
            if not address.is_global:
                raise ValueError
        except ValueError:
            raise HTTPException(400, "Provide the public IPv4 of the sending server")
    spf, dmarc, mx = await asyncio.gather(dns_query(domain, "TXT"), dns_query("_dmarc." + domain, "TXT"), dns_query(domain, "MX"))
    if mx["state"] == "observed":
        mx["state"] = "null_mx" if any(r.split()[-1] == "." for r in mx["records"]) else "present"
    dkim = txt_result(await dns_query(selector + "._domainkey." + domain, "TXT"), "", dkim=True) if selector else {"state": "not_measured", "records": []}
    blacklist = await blacklist_check(ip) if ip else {"state": "not_measured", "records": [], "source": "Spamhaus ZEN"}
    return {"domain": domain, "checked_at": datetime.now(timezone.utc).isoformat(),
            "selector": selector, "sending_ipv4": ip,
            "checks": {"SPF": txt_result(spf, "v=spf1"), "DKIM": dkim,
                       "DMARC": txt_result(dmarc, "v=DMARC1"), "MX": mx, "Blacklist": blacklist}}


@router.get("/mailboxes")
async def mailbox_diagnostics(request: Request, db: AsyncSession = Depends(get_db)):
    # Explicit projection: never load passwords or return transport errors containing secrets.
    stmt = select(Inbox.id, Inbox.email, Inbox.provider, Inbox.paused, Inbox.max_emails_per_day,
                  Inbox.max_emails_per_hour, SmtpAccount.id.label("account_id"),
                  SmtpAccount.last_tested_at, SmtpAccount.last_test_ok,
                  SmtpAccount.retention_mode, SmtpAccount.retention_days,
                  SmtpSyncState.last_sync_at, SmtpSyncState.last_error).outerjoin(
                      SmtpAccount, SmtpAccount.inbox_id == Inbox.id).outerjoin(
                      SmtpSyncState, SmtpSyncState.inbox_id == Inbox.id).order_by(Inbox.email)
    rows = []
    for row in (await db.execute(stmt)).all():
        item = dict(row._mapping)
        item["connection_test"] = ("not_configured" if not item.pop("account_id") else
                                   "not_measured" if not row.last_tested_at else "passed" if row.last_test_ok else "failed")
        item.pop("last_test_ok")
        item["sync_state"] = "error" if item.pop("last_error") else "observed" if row.last_sync_at else "not_measured"
        rows.append(item)
    return {"demo": bool(getattr(request.app.state, "is_demo", False)), "rows": rows}
