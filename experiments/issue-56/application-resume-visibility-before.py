"""Reproduce the rendered résumé-warning gap against the actual parent."""
from application_parent_fixture import published_application_sources
import subprocess
import sys

parent = 'e68448ac'
native = '--native' in sys.argv
paths = ['js/src/jobs/' + name for name in [
    'application-page.js', 'application-options.js', 'application-result.js',
    'application-holds.js', 'application-review.js', 'application-actions.js',
]]
if native:
    paths.append('js/src/web/app.min.js')
with published_application_sources(__file__, parent, paths) as (root, env):
    log_path = root / f'ci-logs/application-resume-visibility-before{"-native" if native else ""}.log'
    command = ['node', 'experiments/issue-56/application-resume-visibility-native.mjs', '--before'] if native else [
        'node', '--test', '--test-concurrency=1', 'js/tests/job-application-resume-visibility.test.js']
    with log_path.open('w') as log:
        result = subprocess.run(command, cwd=root,
            env=env,
            stdout=log, stderr=subprocess.STDOUT)
    text = log_path.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert ('rendered résumé warning must block' if native else 'fail 6') in text
    print(f'Expected parent visibility failures at {parent}; exit {result.returncode}; native={native}')
