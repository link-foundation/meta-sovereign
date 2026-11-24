"""Retain an actual-parent admission failure and the missing control screenshot."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = '0aa60851'
with published_application_sources(__file__, parent) as (root, env):
    path, result = run_parent_application_probe(root, env, 'application-pacing', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=paced reviews persist', 'js/tests/job-application-pacing.test.js'])
    assert result.returncode != 0 and 'did not save its admission interval' in path.read_text()
    native_env = dict(env, APPLICATION_PACING_SCREENSHOTS='docs/screenshots',
                      APPLICATION_PACING_SCREENSHOT_PREFIX='application-pacing-before')
    path, result = run_parent_application_probe(root, native_env, 'application-pacing', [
        'node', '--max-old-space-size=384', 'experiments/issue-56/application-pacing-native.mjs'], native=True)
    assert result.returncode != 0 and 'optional pacing control is absent' in path.read_text()
print('Exact-parent admission and native control failures retained; sources/bundle restored and processes drained.')
