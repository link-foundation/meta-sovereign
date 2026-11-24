"""Reproduce unsafe default entry on the published parent; restore every source."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, 'a74dbc73') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-language-native.mjs']
        env = dict(env, APPLICATION_LANGUAGE_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=confirmed entry opens the full form', 'js/tests/job-application-language.test.js']
    log_path = root / f'ci-logs/application-language-before{"-native" if native else ""}.log'
    with log_path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    expected = 'Default application language control is missing.' if native else 'undefined !== 1'
    assert result.returncode != 0 and expected in log_path.read_text(), log_path.read_text()
    print('Exact parent regression reproduced; all sources restored and fixtures drained.')
