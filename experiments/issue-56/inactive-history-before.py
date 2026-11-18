"""Run the bounded browser regression against one actual parent implementation."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
mode = sys.argv[1] if len(sys.argv) > 1 else 'watch'
source = {
    'watch': 'js/src/sources/browser-answer-watch.js',
    'scroll': 'js/src/sources/browser-chat-list-state.js',
}[mode]
path = root / source
current = path.read_bytes()
parent = subprocess.check_output(['git', 'show', f'41fd7342:{source}'], cwd=root)
try:
    path.write_bytes(parent)
    result = subprocess.run(
        ['node', 'experiments/issue-56/inactive-history-browser.mjs'],
        cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
        check=False,
    )
    if result.returncode == 0:
        raise SystemExit('Expected the actual parent regression to fail')
    print(f'Expected {mode} parent regression: exit {result.returncode}')
finally:
    path.write_bytes(current)
