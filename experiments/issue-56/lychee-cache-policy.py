"""Verify restored native cache semantics without contacting external hosts."""
import argparse
import csv
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('binary', type=Path)
parser.add_argument('--workflow', type=Path, default=ROOT / '.github/workflows/links.yml')
args = parser.parse_args()
BINARY = args.binary.resolve()
WORKFLOW = args.workflow.read_text()
block = re.search(r'          args: >-\n((?:            .*\n)+)', WORKFLOW)
FLAGS = shlex.split(block[1])
CACHE_FLAGS = ['--cache']
for flag in ['--max-cache-age', '--cache-exclude-status']:
    CACHE_FLAGS.extend([flag, FLAGS[FLAGS.index(flag) + 1]])


class CachePolicy(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='lychee-cache-')
        self.root = Path(self.temporary.name)
        self.requests = []
        self.statuses = {}
        fixture = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                reply = fixture.statuses.get(self.path, 200)
                fixture.requests.append((self.path, reply))
                self.send_response(reply)
                self.send_header('Content-Length', '2')
                self.end_headers()
                self.wfile.write(b'ok')

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cache = self.root / '.lycheecache'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(3)
        self.assertFalse(self.thread.is_alive(), 'Owned HTTP fixture did not drain')
        self.temporary.cleanup()

    def check(self, paths):
        links = self.root / 'links.md'
        links.write_text('\n'.join(
            f'<http://127.0.0.1:{self.server.server_port}{path}>' for path in paths))
        result = subprocess.run([
            str(BINARY), '--no-progress', '--verbose', *CACHE_FLAGS,
            '--max-concurrency', '1', '--max-retries', '0', str(links),
        ], cwd=self.root, capture_output=True, text=True, env={
            **os.environ, 'RAYON_NUM_THREADS': '1', 'TOKIO_WORKER_THREADS': '1',
            'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1',
        })
        print(json.dumps(dict(test=self._testMethodName, paths=paths,
                              requests=self.requests, exitCode=result.returncode)), flush=True)
        return result

    def test_workflow_preserves_partial_success_before_strict_failure(self):
        self.assertIn('uses: actions/cache/restore@', WORKFLOW)
        self.assertIn('uses: actions/cache/save@', WORKFLOW)
        restore = WORKFLOW.index('uses: actions/cache/restore@')
        checker = WORKFLOW.index('id: lychee\n')
        verification = WORKFLOW.index('id: cache-policy\n')
        save = WORKFLOW.index('uses: actions/cache/save@')
        failure = WORKFLOW.index('name: Fail on every unresolved link or checker error')
        self.assertLess(restore, checker)
        self.assertLess(checker, verification)
        self.assertLess(verification, save)
        self.assertLess(save, failure)
        save_step = WORKFLOW[WORKFLOW.rfind('      - name:', 0, save):save]
        self.assertIn("steps.cache-policy.outcome == 'success'", save_step)
        self.assertIn("!cancelled()", save_step)
        self.assertNotIn("steps.lychee.outputs.exit_code == '0'", save_step)
        self.assertEqual(WORKFLOW.count('path: .lycheecache'), 2)
        self.assertIn('github.run_attempt', WORKFLOW)
        self.assertIn('github.ref', WORKFLOW)
        self.assertIn("hashFiles('lychee.toml', '.lycheeignore', '.github/workflows/links.yml')", WORKFLOW)

    def test_successes_survive_failed_run_and_only_failed_links_are_retried(self):
        self.statuses['/recover'] = 503
        first = self.check(['/stable', '/recover'])
        self.assertNotEqual(first.returncode, 0)
        stored = self.cache.read_bytes()
        self.assertIn(b'/stable', stored)
        self.assertNotIn(b'/recover', stored)
        # Recreate a fresh checkout's cache file from the saved bytes.
        self.cache.unlink()
        self.cache.write_bytes(stored)
        self.statuses['/recover'] = 200
        second = self.check(['/stable', '/recover'])
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertCountEqual(self.requests[:2], [('/stable', 200), ('/recover', 503)])
        self.assertEqual(self.requests[2:], [('/recover', 200)])

    def test_cold_jobs_repeat_successful_requests(self):
        self.assertEqual(self.check(['/stable']).returncode, 0)
        self.cache.unlink()
        self.assertEqual(self.check(['/stable']).returncode, 0)
        self.assertEqual(self.requests, [('/stable', 200)] * 2)

    def test_permanent_failures_still_fail_after_successful_cache_restore(self):
        self.assertEqual(self.check(['/stable']).returncode, 0)
        self.statuses.update({'/missing': 404, '/unavailable': 503})
        for _ in range(2):
            result = self.check(['/stable', '/missing', '/unavailable'])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('404', result.stdout + result.stderr)
            self.assertIn('503', result.stdout + result.stderr)
        self.assertEqual(self.requests.count(('/stable', 200)), 1)
        self.assertEqual(self.requests.count(('/missing', 404)), 2)
        self.assertEqual(self.requests.count(('/unavailable', 503)), 2)
        self.assertNotIn(b'/missing', self.cache.read_bytes())
        self.assertNotIn(b'/unavailable', self.cache.read_bytes())

    def test_one_day_expiry_rechecks_a_previously_successful_page(self):
        self.assertEqual(self.check(['/expires']).returncode, 0)
        rows = list(csv.reader(self.cache.read_text().splitlines()))
        self.assertEqual(len(rows), 1)
        rows[0][-1] = str(int(time.time()) - 86401)
        with self.cache.open('w', newline='') as file:
            csv.writer(file).writerows(rows)
        self.statuses['/expires'] = 404
        self.assertNotEqual(self.check(['/expires']).returncode, 0)
        self.assertEqual(self.requests, [('/expires', 200), ('/expires', 404)])


if __name__ == '__main__':
    unittest.main(argv=[__file__], verbosity=2)
