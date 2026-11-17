"""Verify native HTTP retry decisions with finite isolated server responses."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

parser = argparse.ArgumentParser()
parser.add_argument('binary', type=Path)
BINARY = parser.parse_args().binary.resolve()


class TransientRetry(unittest.TestCase):
    def request(self, codes, retries=2):
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                status = codes[min(len(requests), len(codes) - 1)]
                requests.append(status)
                self.send_response(status)
                self.send_header('Content-Length', '2')
                self.end_headers()
                self.wfile.write(b'ok')

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix='lychee-retry-') as temp:
                links = Path(temp) / 'links.md'
                links.write_text(f'<http://127.0.0.1:{server.server_port}/finite-check>\n')
                result = subprocess.run([
                    str(BINARY), '--no-progress', '--verbose',
                    '--max-concurrency', '1', '--max-retries', str(retries),
                    '--retry-wait-time', '1',
                    str(links),
                ], cwd=temp, capture_output=True, text=True, timeout=25, env={
                    **os.environ, 'RAYON_NUM_THREADS': '1', 'TOKIO_WORKER_THREADS': '1',
                    'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1',
                })
        finally:
            server.shutdown()
            server.server_close()
            thread.join(3)
            self.assertFalse(thread.is_alive(), 'Owned HTTP fixture did not drain')
        print(json.dumps(dict(codes=codes, retries=retries,
                              requests=requests, exitCode=result.returncode)), flush=True)
        return result, requests

    def recover(self, code):
        result, requests = self.request([code, 200])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(requests, [code, 200])

    def test_recover_503(self):
        self.recover(503)

    def test_recover_500(self):
        self.recover(500)

    def test_recover_408(self):
        self.recover(408)

    def test_persistent_server_error_exhausts_finite_budget(self):
        result, requests = self.request([503])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(requests, [503] * 3)

    def test_zero_retries_does_not_accept_transient_failure(self):
        result, requests = self.request([503, 200], retries=0)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(requests, [503])

    def test_permanent_missing_page_fails_without_retry(self):
        result, requests = self.request([404, 200])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(requests, [404])


if __name__ == '__main__':
    unittest.main(argv=[__file__], verbosity=2)
