"""Wrap pg_dump output using persisted backup encryption settings."""
from __future__ import annotations

import logging

from app.backup_package import pack_backup, BackupPackageError

log = logging.getLogger("quickly.backup_delivery")


def wrap_pg_dump_for_backup_config(manifest: dict, dump: bytes, cfg: dict) -> bytes:
    """Package *dump* using *cfg* from :func:`app.app_settings.get_backup_config`."""
    hint = (cfg.get("backup_encryption_hint") or "").strip()
    want = bool(cfg.get("encrypt_backups"))
    pwd = (cfg.get("backup_encryption_password") or "").strip()
    encrypted = want and bool(pwd)
    if want and not pwd:
        raise BackupPackageError("Backup encryption requires a configured password")
    return pack_backup(
        manifest,
        dump,
        encrypt=encrypted,
        password=pwd if encrypted else None,
        password_hint=hint,
    )
