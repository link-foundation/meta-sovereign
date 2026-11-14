"""Exact published-parent popup recovery failure with finite focused fixtures."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '103c8c24') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-popup-native.mjs']
        env = dict(env, POPUP_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=acknowledged popup recovery requires new entry', 'js/tests/job-application-popup.test.js']
    path = root / f'ci-logs/application-popup-before{"-native" if native else ""}.log'
    with path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    content = path.read_text()
    assert result.returncode != 0 and ('undefined' in content if not native else 'acknowledged popup must offer separately confirmed re-entry' in content), content
    print('Exact published parent cannot re-enter an acknowledged unsent popup; sources restored and fixtures drained')
