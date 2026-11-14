"""Reproduce the exact published batch review lock and preserve its screenshot."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

native = '--native' in sys.argv
with published_application_sources(__file__, '8007a002') as (root, env):
    env.update(NODE_OPTIONS='--max-old-space-size=384',
               APPLICATION_SCREENSHOTS='docs/screenshots/batch-review-ownership-before')
    command = (['node', 'js/tests/e2e-job-application-batch-browser.mjs'] if native else
               ['node', '--test', '--test-concurrency=1',
                'js/tests/job-application-batch-ownership.test.js'])
    log, result = run_parent_application_probe(
        root, env, 'batch-review-ownership', command, native=native)
    assert result.returncode != 0, log
    text = log.read_text()
    assert ('element is not enabled' if native else 'disabled=""') in text, text
print('Exact-parent own-review refusal reproduced; original sources and bundle restored.')
