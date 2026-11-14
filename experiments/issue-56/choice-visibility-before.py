"""Finite actual-parent browser reproduction; always restore production sources."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'c35f813d507dbff50a2d094ebe12177b01304020'
paths = ['js/src/sources/browser-choice-controller.js',
         'js/src/sources/browser-choices.js']
current = {name: (root / name).read_bytes() for name in paths}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
               CHOICE_SCREENSHOTS='docs/screenshots/issue-56-choice-visibility/before')
    log = root / 'ci-logs/choice-visibility-before.log'
    with log.open('w') as output:
        result = subprocess.run(
            ['node', 'experiments/issue-56/choice-visibility-browser.mjs'],
            cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
    text = log.read_text()
    assert text.count('[choice-visibility] FAIL') == 2
    assert text.count('[choice-visibility] PASS') == 9
    print('Actual parent: two reveal regressions fail; nine existing guards pass.')
finally:
    for name, content in current.items():
        (root / name).write_bytes(content)
