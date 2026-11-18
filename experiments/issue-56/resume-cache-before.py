"""Reproduce the cache durability defect on the exact published parent."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '281d6dcc') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    command += ['experiments/issue-56/resume-cache-browser.mjs'] if native else [
        '--test', '--test-concurrency=1', 'js/tests/job-resume-cache-durability.test.js']
    env = dict(env, RESUME_CACHE_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    path, result = run_parent_application_probe(root, env, 'resume-cache', command, native=native)
    expected = 'Rejected discovery must not replace' if native else 'Unacknowledged CV'
    assert result.returncode != 0 and expected in path.read_text()
print('Published-parent cache failure reproduced; actual sources/bundle restored and fixtures drained.')
