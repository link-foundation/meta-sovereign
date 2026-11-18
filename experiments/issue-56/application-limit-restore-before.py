"""Reproduce absent expiry restoration against the exact published wait unit."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, 'e2bc1bd9') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-limit-restore-native.mjs']
        env = dict(env, APPLICATION_LIMIT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=confirmed wait restoration preserves later', 'js/tests/job-application-limit-restore.test.js']
    path, result = run_parent_application_probe(root, env, 'application-limit-restore', command, native)
    assert result.returncode != 0 and 'Confirmed expiry restoration is missing.' in path.read_text(), path.read_text()
    print('Published-parent missing expiry restoration reproduced; sources restored and fixtures drained.')
