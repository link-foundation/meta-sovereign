"""Replace only modified pre-existing production files with exact parent bytes."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = '438f2bf4c223d6e5a13b2332a04b0a79317c7e68'
paths = subprocess.check_output([
    'git', 'diff', '--name-only', parent, '--', 'js/src'], cwd=root,
    text=True).splitlines()
paths = [path for path in paths if path.endswith('.js') and not path.endswith('.min.js')]
existing = set(subprocess.check_output([
    'git', 'ls-tree', '-r', '--name-only', parent, '--', 'js/src'], cwd=root,
    text=True).splitlines())
paths = [path for path in paths if path in existing]
saved = {path: (root / path).read_bytes() for path in paths}
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output([
            'git', 'show', f'{parent}:{path}'], cwd=root))
    if '--native' in sys.argv:
        subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, check=True)
        result = subprocess.run([
            'node', '--max-old-space-size=384',
            'experiments/issue-56/question-hidden-links-browser.mjs', '--before'],
            cwd=root, env={**os.environ, 'RUN_BROWSER_E2E': '1'}, check=False)
        expected = 0
    else:
        result = subprocess.run([
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            'js/tests/question-hidden-links.test.js'], cwd=root, check=False)
        expected = 1
    if result.returncode != expected:
        raise SystemExit(f'Expected exit {expected}, got {result.returncode}')
finally:
    for path, content in saved.items():
        (root / path).write_bytes(content)
    if '--native' in sys.argv:
        subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, check=True)
