"""Replay the actual parent verifier in the finite native workplace scenario."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/jobs/cv-watch-verification.js'
current = source.read_bytes()
parent = subprocess.check_output([
    'git', 'show', 'd76215a10034df559103f3d5e2604158eba174a1:js/src/jobs/cv-watch-verification.js'
], cwd=root)
try:
    source.write_bytes(parent)
    with (root / 'ci-logs/cv-workplace-identity-browser-before.log').open('w') as log:
        result = subprocess.run([
            'node', 'experiments/issue-56/cv-workplace-identity-browser.mjs', '--before'
        ], cwd=root, env=dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='webkit',
                             NODE_OPTIONS='--max-old-space-size=384'),
           stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
    assert 'The exact record must be confirmed' in (root / 'ci-logs/cv-workplace-identity-browser-before.log').read_text()
finally:
    source.write_bytes(current)
