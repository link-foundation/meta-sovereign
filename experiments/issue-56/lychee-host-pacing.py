"""Check actual lychee admission against a finite, isolated burst-sensitive host."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import tomllib
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('binary', type=Path)
parser.add_argument('--config', type=Path, default=ROOT / 'lychee.toml')
args = parser.parse_args()
BINARY = args.binary.resolve()
CONFIG = tomllib.loads(args.config.read_text())


class Fixture:
    def __init__(self, status=None):
        self.requests = []
        self.active = 0
        self.peak = 0
        self.lock = threading.Lock()
        fixture = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                now = time.monotonic()
                with fixture.lock:
                    previous = fixture.requests[-1][0] if fixture.requests else None
                    reply = status or (503 if previous and now - previous < 0.45 else 200)
                    fixture.requests.append((now, reply))
                    fixture.active += 1
                    fixture.peak = max(fixture.peak, fixture.active)
                try:
                    # Deliberately overlap four bounded requests to verify the
                    # host semaphore as well as the interval, without load.
                    time.sleep(0.55)
                    self.send_response(reply)
                    self.send_header('Content-Length', '2')
                    self.end_headers()
                    self.wfile.write(b'ok')
                finally:
                    with fixture.lock:
                        fixture.active -= 1

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(3)
        assert not self.thread.is_alive(), 'Owned HTTP fixture did not drain'


class HostPacing(unittest.TestCase):
    def check_host(self, configured, status=None):
        with tempfile.TemporaryDirectory(prefix='lychee-pacing-') as temp, Fixture(status) as host:
            root = Path(temp)
            config = root / 'lychee.toml'
            # Reuse the real GitHub settings unchanged under a private loopback
            # hostname. The real checker parses TOML and enforces the policy.
            values = CONFIG.get('hosts', {}).get('github.com', {}) if configured else {}
            config.write_text('[hosts."127.0.0.1"]\n' + ''.join(
                f'{key} = {json.dumps(value)}\n' for key, value in values.items()
            ))
            links = root / 'links.md'
            links.write_text('\n'.join(
                f'<http://127.0.0.1:{host.server.server_port}/page-{index}>'
                for index in range(4)
            ))
            completed = subprocess.run([
                str(BINARY), '--config', str(config), '--no-progress', '--verbose',
                '--max-concurrency', '4', '--max-retries', '0', str(links),
            ], cwd=root, capture_output=True, text=True, timeout=15, env={
                **os.environ, 'RAYON_NUM_THREADS': '1', 'TOKIO_WORKER_THREADS': '1',
                'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1',
            })
        self.assertEqual(len(host.requests), 4, completed.stdout + completed.stderr)
        gaps = [round((right[0] - left[0]) * 1000, 1)
                for left, right in zip(host.requests, host.requests[1:])]
        statuses = [reply for _, reply in host.requests]
        print(json.dumps(dict(configured=configured, forcedStatus=status,
                              exitCode=completed.returncode, gapsMs=gaps,
                              statuses=statuses, peak=host.peak)), flush=True)
        return completed, gaps, statuses, host.peak

    def test_defaults_reproduce_rejected_burst(self):
        result, _, statuses, peak = self.check_host(False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(503, statuses)
        self.assertGreater(peak, 1)

    def test_configured_host_spaces_and_serializes_requests(self):
        result, gaps, statuses, peak = self.check_host(True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(statuses, [200] * 4)
        self.assertTrue(all(gap >= 450 for gap in gaps), gaps)
        self.assertEqual(peak, 1)

    def test_real_missing_pages_still_fail(self):
        result, _, statuses, _ = self.check_host(True, 404)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(statuses, [404] * 4)
        self.assertIn('404', result.stdout + result.stderr)

    def test_persistent_server_failure_still_fails(self):
        result, _, statuses, _ = self.check_host(True, 503)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(statuses, [503] * 4)
        self.assertIn('503', result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main(argv=[__file__], verbosity=2)
