"""CI smoke test against a fresh dedicated PostgreSQL demo database."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:18551"


def request(path, token="", data=None, method=None, expected=200):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(BASE + path, headers=headers, method=method,
                  data=json.dumps(data).encode() if data is not None else None)
    try:
        response = urlopen(req, timeout=20)
    except HTTPError as exc:
        response = exc
    with response:
        body = response.read().decode()
        assert response.status == expected, (path, response.status, body[:500])
        return json.loads(body) if "application/json" in response.headers.get("Content-Type", "") else body


def check(restarted):
    token = request("/api/auth/login", data={"username": "demo", "password": os.environ["DEMO_ADMIN_PASSWORD"]})["access_token"]
    assert "sekaro-demo-banner" in request("/")
    assert len(request("/api/campaigns", token)) == 6
    assert len(request("/api/inboxes", token)) == 3
    assert len(request("/api/templates", token)) == 4
    assert request("/api/notifications", token)["total"] == 12
    assert request("/api/schedule/scheduled", token)
    threads = request("/api/unibox", token)["items"]
    assert len(threads) == 12
    assert all(thread["lead_email"] for thread in threads)
    thread = threads[0]
    detail = request(f'/api/unibox/threads/{quote(thread["thread_id"], safe="")}?inbox_id={thread["inbox_id"]}', token)
    assert len(detail["messages"]) == 3
    today = datetime.utcnow().date()
    stats = request(f"/api/analytics/daily?start_date={today - timedelta(days=30)}&end_date={today}", token)
    assert sum(row["sent"] for row in stats) == 120
    assert sum(row["unique_opens"] for row in stats) > 0
    assert sum(row["unique_clicks"] for row in stats) > 0
    for path in ["/api/unibox/send", "/api/unibox/sync", "/api/templates/actions/test-send", "/api/campaigns/1/send-test"]:
        request(path, token, data={}, expected=403)
    # A real edit survives the second startup without duplicating the seed.
    if restarted:
        assert request("/api/leads/1", token)["name"] == "DEMO CI edited contact"
    else:
        request("/api/leads/1", token, data={"name": "DEMO CI edited contact"}, method="PATCH")


for restarted in (False, True):
    with tempfile.TemporaryFile(mode="w+") as log:
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.demo.server:create_app", "--factory",
                                    "--host", "127.0.0.1", "--port", "18551"], cwd=ROOT, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 90
            while True:
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("Demo startup failed or timed out")
                try:
                    assert request("/api/demo/status")["scheduler_enabled"] is False
                    break
                except URLError:
                    time.sleep(0.5)
            check(restarted)
        except Exception:
            log.seek(0)
            print(log.read())
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
print("Demo startup, login, data, blocked mail actions and restart: OK")
