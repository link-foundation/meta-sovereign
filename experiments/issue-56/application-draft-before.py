"""Keep the exact published absence/loss reproducible; always restore current bytes."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
changed = subprocess.check_output(['git', 'diff', '--name-only', '4f482c34', '--', 'js/src'], cwd=root, text=True).splitlines()
paths = [name for name in changed if subprocess.run(
    ['git', 'cat-file', '-e', f'4f482c34:{name}'], cwd=root,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0]
original = {name: (root / name).read_bytes() for name in paths}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'4f482c34:{name}'], cwd=root))
    if '--mcp' in sys.argv:
        with (root / 'ci-logs/application-draft-before-mcp-server.log').open('wb') as log:
            server = subprocess.Popen(['node', '--max-old-space-size=384', 'experiments/issue-56/vacancy-mcp-server.mjs'],
                cwd=root, stdout=log, stderr=subprocess.STDOUT,
                env=dict(os.environ, APPLICATION_REVIEW_FIXTURE='1', APPLICATION_DRAFT_FIXTURE='1'))
            try:
                print(f'Exact-parent draft fixture process {server.pid}', flush=True)
                assert server.wait() == 0
            finally:
                if server.poll() is None: server.terminate(); server.wait()
    else:
        native = '--native' in sys.argv
        command = ['node', '--max-old-space-size=384', 'experiments/issue-56/application-draft-native.mjs'] if native else [
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=private native draft survives', 'js/tests/job-application-drafts.test.js']
        log = root / ('ci-logs/application-draft-before-native.log' if native else 'ci-logs/application-draft-before.log')
        with log.open('wb') as out:
            result = subprocess.run(command, cwd=root, stdout=out, stderr=subprocess.STDOUT,
                env=dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='chromium', E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome'))
        assert result.returncode != 0, 'The parent unexpectedly provides native draft backup'
        assert ('404' in log.read_text()) if native else ('is not a function' in log.read_text())
        print('Exact parent lacks native draft backup; isolated resources drained')
finally:
    for name, value in original.items(): (root / name).write_bytes(value)
    assert all((root / name).read_bytes() == value for name, value in original.items())
