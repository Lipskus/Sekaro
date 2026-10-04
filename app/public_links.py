"""Keep unsubscribe links independent of private panel and tracking hosts."""
import os
from urllib.parse import urlsplit


def get_unsubscribe_base(fallback: str) -> str:
    value = os.getenv("SEKARO_UNSUBSCRIBE_BASE_URL", "").strip().rstrip("/")
    if not value:
        return fallback
    url = urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path:
        raise ValueError("SEKARO_UNSUBSCRIBE_BASE_URL must be an HTTPS origin")
    return value


def is_public_unsubscribe_url(url: str) -> bool:
    base = os.getenv("SEKARO_UNSUBSCRIBE_BASE_URL", "").strip().rstrip("/")
    return bool(base) and url.startswith(base + "/u/")
