"""Two listeners, one container; terminate the pair if either listener dies."""
import subprocess
import sys
import signal
import time

def stop(signum, frame):
    raise SystemExit(0)

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

children = [subprocess.Popen([sys.executable, '-m', 'uvicorn', 'public_endpoint.server:'+app,
            '--factory','--host','0.0.0.0','--port',port,'--no-access-log','--no-proxy-headers'])
            for app, port in [('public_app','8080'),('sync_app','8081')]]
try:
    while all(p.poll() is None for p in children):
        time.sleep(0.5)
finally:
    for p in children:
        p.terminate()
    for p in children:
        p.wait()
sys.exit(1)
