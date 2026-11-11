"""Finite parent regression: change only the sender, always restore it."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
target = root / 'js/src/sources/browser-sender.js'
current = target.read_bytes()
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    target.write_bytes(subprocess.check_output(['git', 'show', '33eac5b5:js/src/sources/browser-sender.js'], cwd=root))
    for name, command in [
        ('unit', ['node', '--test', '--test-concurrency=1', 'js/tests/browser-choices.test.js']),
        ('browser', ['node', 'experiments/issue-56/provider-choices-browser.mjs']),
    ]:
        if name == 'browser':
            env['CHOICE_SCREENSHOTS'] = 'docs/screenshots/issue-56-provider-choices/parent'
        with (root / f'ci-logs/choice-execution-before-{name}.log').open('w') as log:
            result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        assert result.returncode != 0, f'{name}: parent unexpectedly passed'
        print(f'{name}: parent failed as expected')
        if name == 'browser':
            directory = root / env['CHOICE_SCREENSHOTS']
            (directory / 'provider-choices-before.png').replace(
                directory / 'parent-provider-choices-before.png')
finally:
    target.write_bytes(current)
