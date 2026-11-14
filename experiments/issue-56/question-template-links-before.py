"""Run new finite link-boundary regressions against the exact published matcher."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/automation/question-match.js'
saved = source.read_bytes()
try:
    if '--before' in sys.argv:
        source.write_bytes(subprocess.check_output([
            'git', 'show', 'f5e62321:js/src/automation/question-match.js'], cwd=root))
    if '--native' in sys.argv:
        subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, check=True)
        result = subprocess.run([
            'node', '--max-old-space-size=384',
            'experiments/issue-56/question-template-links-browser.mjs',
            *(['--before'] if '--before' in sys.argv else [])], cwd=root,
            env={**os.environ, 'RUN_BROWSER_E2E': '1'}, check=False)
    else:
        result = subprocess.run([
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            'js/tests/question-template-links.test.js'], cwd=root, check=False)
    expected = 1 if '--before' in sys.argv and '--native' not in sys.argv else 0
    if result.returncode != expected:
        raise SystemExit(f'Expected exit {expected}, got {result.returncode}')
finally:
    source.write_bytes(saved)
    if '--native' in sys.argv and '--before' in sys.argv:
        subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, check=True)
