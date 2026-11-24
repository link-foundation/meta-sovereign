"""Reproduce missing confirmed waiting against the published draft-preservation unit."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

expiry = '--expiry' in sys.argv
parent = 'ef99739ba4f2684d7714c456f794caa004dbe41c' if expiry else 'cac7f7d3'
with published_application_sources(__file__, parent) as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-limit-wait-native.mjs']
        env = dict(env, APPLICATION_LIMIT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        pattern = 'deadline crossing during backup' if expiry else 'confirmed daily waiting backs later'
        command += ['--test', '--test-concurrency=1', f'--test-name-pattern={pattern}', 'js/tests/job-application-limit-wait.test.js']
    prefix = 'ci-limit-expiry' if expiry else 'application-limit-wait'
    path, result = run_parent_application_probe(root, env, prefix, command, native)
    expected = "'refused'" if expiry else 'Confirmed daily-limit waiting is missing.'
    assert result.returncode != 0 and expected in path.read_text(), path.read_text()
    print(f'Published-parent failure retained: {path.name}; sources restored and fixtures drained.')
