"""Reproduce the exact published missing deferral without leaving replaced sources."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = '5e622049'
changed = subprocess.check_output(['git', 'diff', '--name-only', parent, '--', 'js/src'], cwd=root, text=True).splitlines()
original = {name: (root / name).read_bytes() for name in changed if subprocess.run(
    ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0}
env = dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='chromium', E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome')
try:
    for name in original:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    if '--mcp' in sys.argv:
        with (root / 'ci-logs/application-deferral-before-mcp-server.log').open('wb') as log:
            server = subprocess.Popen(['node', '--max-old-space-size=384', 'experiments/issue-56/vacancy-mcp-server.mjs'],
                cwd=root, stdout=log, stderr=subprocess.STDOUT,
                env=dict(env, APPLICATION_REVIEW_FIXTURE='1', APPLICATION_DRAFT_FIXTURE='1'))
            try:
                print(f'Exact parent deferral fixture process {server.pid}', flush=True)
                assert server.wait() == 0
            finally:
                if server.poll() is None: server.terminate(); server.wait()
    else:
        native = '--native' in sys.argv
        command = ['node', '--max-old-space-size=384', 'experiments/issue-56/application-deferral-native.mjs'] if native else [
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=confirmed deferral acknowledges', 'js/tests/job-application-deferrals.test.js']
        log = root / ('ci-logs/application-deferral-before-native.log' if native else 'ci-logs/application-deferral-before.log')
        with log.open('wb') as out:
            result = subprocess.run(command, cwd=root, stdout=out, stderr=subprocess.STDOUT, env=env)
        assert result.returncode != 0
        assert ('404' if native else 'is not a function') in log.read_text()
        print('Exact published parent lacks backed deferral; all fixture resources drained')
finally:
    for name, value in original.items(): (root / name).write_bytes(value)
    assert all((root / name).read_bytes() == value for name, value in original.items())
