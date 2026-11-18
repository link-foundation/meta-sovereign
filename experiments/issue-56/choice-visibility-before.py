"""Finite actual-parent browser reproduction; always restore production sources."""
from application_parent_fixture import published_application_sources
import os
import subprocess

parent = 'c35f813d507dbff50a2d094ebe12177b01304020'
paths = ['js/src/sources/browser-choice-controller.js',
         'js/src/sources/browser-choices.js']
with published_application_sources(__file__, parent, paths) as (root, env):
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
