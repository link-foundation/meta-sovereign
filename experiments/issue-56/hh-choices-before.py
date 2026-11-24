"""Failing parent regression, changing only built-in registration and restoring it."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
target = root / 'js/src/sources/web-uis.js'
current = target.read_bytes()
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384',
       'CHOICE_SCREENSHOTS': 'docs/screenshots/issue-56-hh-choices/before'}
try:
    target.write_bytes(subprocess.check_output(['git', 'show', '2a0fb639:js/src/sources/web-uis.js'], cwd=root))
    with (root / 'ci-logs/hh-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'experiments/issue-56/hh-choices-browser.mjs'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'Parent unexpectedly passed'
    output = (root / 'ci-logs/hh-browser-before.log').read_text()
    assert 'no web UI is known' in output and 'unsupported-source' in output
    image = root / env['CHOICE_SCREENSHOTS'] / 'hh-choices-before.png'
    image.replace(image.with_name('parent-hh-choices-before.png'))
    print('Parent missing built-in HH: expected browser regression confirmed')
finally:
    target.write_bytes(current)
