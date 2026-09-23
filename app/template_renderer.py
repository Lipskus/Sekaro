"""Dynamic message-template rendering for Sekaro."""
from __future__ import annotations

import html
import re
from typing import Any

from app.models import Lead

# Variable keys intentionally stay generic. Sekaro does not define business-
# specific fields such as country, company, land, marina, hotel, etc.
VARIABLE_RE = re.compile(r"\{\{\s*([\w]+)\s*\}\}", re.UNICODE)

SYSTEM_VARIABLES = (
    {"key": "email", "label": "E-mail", "system": True},
    {"key": "name", "label": "Nazwa / imię", "system": True},
)


def contact_context(lead: Lead | None) -> dict[str, Any]:
    """Build a rendering context from core contact fields + arbitrary custom_data."""
    if lead is None:
        return {"email": "", "name": ""}

    context: dict[str, Any] = {
        "email": lead.email or "",
        "name": lead.name or "",
    }
    if isinstance(getattr(lead, "custom_data", None), dict):
        for key, value in lead.custom_data.items():
            if key not in context:
                context[str(key)] = "" if value is None else value
    return context


def extract_variables(*parts: str | None) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for part in parts:
        for match in VARIABLE_RE.finditer(part or ""):
            key = match.group(1)
            if key not in seen:
                seen.add(key)
                found.append(key)
    return found


def render_template_value(
    text: str | None,
    context: dict[str, Any],
    *,
    html_escape_values: bool = False,
) -> tuple[str, list[str]]:
    """Render placeholders and return missing keys.

    Missing values stay visible as placeholders instead of disappearing.
    """
    missing: list[str] = []
    missing_seen: set[str] = set()

    def repl(match: re.Match) -> str:
        key = match.group(1)
        if key not in context or context.get(key) in (None, ""):
            if key not in missing_seen:
                missing_seen.add(key)
                missing.append(key)
            return match.group(0)

        value = str(context[key])
        return html.escape(value, quote=True) if html_escape_values else value

    return VARIABLE_RE.sub(repl, text or ""), missing


def render_message(
    *,
    subject: str,
    body: str,
    is_html: bool,
    lead: Lead | None,
) -> dict[str, Any]:
    context = contact_context(lead)
    rendered_subject, missing_subject = render_template_value(
        subject, context, html_escape_values=False
    )
    rendered_body, missing_body = render_template_value(
        body, context, html_escape_values=is_html
    )
    variables = extract_variables(subject, body)
    missing = list(dict.fromkeys([*missing_subject, *missing_body]))
    return {
        "subject": rendered_subject,
        "body": rendered_body,
        "is_html": bool(is_html),
        "variables": variables,
        "missing_variables": missing,
        "context": context,
    }
