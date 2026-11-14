"""Reproduce missing inactive text admission using the actual parent watch."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'js/src/sources/browser-answer-watch.js'
current = path.read_bytes()
parent = '2b571a75'
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', f'{parent}:js/src/sources/browser-answer-watch.js'], cwd=root))
    result = subprocess.run(['node', 'experiments/issue-56/inactive-text-browser.mjs'],
                            cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode != 0
    print('Actual parent lacks the owned inactive text operation.')
finally:
    path.write_bytes(current)
