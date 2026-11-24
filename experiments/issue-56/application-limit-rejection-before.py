"""Reproduce the issued-rejection recovery gap against the exact published head."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '6b1e9dea') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['js/tests/e2e-job-application-rejection-browser.mjs']
        env = dict(env, APPLICATION_LIMIT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=acknowledged native daily rejection permits',
                    'js/tests/job-application-limit-rejection.test.js']
    path, result = run_parent_application_probe(root, env, 'application-limit-rejection', command, native)
    expected = 'Issued native rejection cannot be restored' if native else 'jobs-application-state'
    assert result.returncode != 0 and expected in path.read_text(), path.read_text()
    print('Exact-parent issued-rejection recovery refusal reproduced; fixtures drained and sources restored.')
