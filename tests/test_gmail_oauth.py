"""The legacy Gmail adapter is not mounted in the current SMTP-only app.

Gmail API remains a later release stage. These tests lock the current boundary;
restoring a legacy callback to satisfy the old test would enable unapproved routes.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth import get_current_user

@pytest.mark.parametrize("path", ["/api/gmail/status", "/api/gmail/accounts", "/oauth/google/callback?code=unused&state=unused"])
def test_legacy_gmail_routes_are_not_enabled(path, engine):
    async def current_user():
        return object()
    app.dependency_overrides[get_current_user] = current_user
    try:
        with TestClient(app) as client:
            response = client.get(path, follow_redirects=False)
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
