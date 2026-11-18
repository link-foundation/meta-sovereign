"""Reproduce the observer-order warning against the actual parent hook."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
target = root / 'js/src/web/chat-layout-trace.js'
current = target.read_bytes()
try:
    target.write_bytes(subprocess.check_output(['git', 'show', '4da8e615:js/src/web/chat-layout-trace.js'], cwd=root))
    with (root / 'ci-logs/layout-observer-before.log').open('w') as log:
        result = subprocess.run(['node', 'experiments/issue-56/layout-observer-browser.mjs'], cwd=root,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384', 'E2E_BROWSER': 'webkit',
                 'LAYOUT_SCREENSHOTS': 'docs/screenshots/issue-56-layout-observer/before'},
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'Parent unexpectedly passed'
    assert 'transient: accurate severity' in (root / 'ci-logs/layout-observer-before.log').read_text()
    directory = root / 'docs/screenshots/issue-56-layout-observer/before'
    (directory / 'layout-transient.png').replace(directory / 'parent-layout-transient.png')
    print('Parent WebKit hook reports warn for the observer-corrected transition')
finally:
    target.write_bytes(current)
