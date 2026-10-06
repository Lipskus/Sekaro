"""Optional ClamAV INSTREAM scan for decrypted restore payloads, disabled by default."""
import asyncio
import os
import socket
import struct


def _scan(data: bytes):
    host = os.getenv('SEKARO_CLAMAV_HOST', '').strip()
    if not host:
        return
    port = int(os.getenv('SEKARO_CLAMAV_PORT', '3310'))
    try:
        with socket.create_connection((host, port), timeout=15) as conn:
            conn.settimeout(120)
            conn.sendall(b'zINSTREAM\0')
            for start in range(0, len(data), 65536):
                chunk = data[start:start + 65536]
                conn.sendall(struct.pack('!I', len(chunk)) + chunk)
            conn.sendall(struct.pack('!I', 0))
            result = b''
            while not result.endswith(b'\0') and len(result) < 4096:
                chunk = conn.recv(4096 - len(result))
                if not chunk:
                    break
                result += chunk
            if result.rstrip(b'\0\n') != b'stream: OK':
                raise ValueError('Restore scan rejected the file or could not complete')
    except (OSError, ValueError) as exc:
        raise ValueError('Antivirus scan failed. Restore remains blocked; check ClamAV status and scan limits.') from exc


async def scan_restore_payload(data: bytes):
    await asyncio.to_thread(_scan, data)
