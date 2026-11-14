"""Preserve the bounded deadline race separately from unmeasured hosted timing."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-limit-expiry')
assert all(value in read('before') for value in ('tests 2', 'fail 1', "'refused'", "'review'"))
assert 'pass 65' in read('focused-final') and 'fail 0' in read('focused-final')
assert '65 passed | 0 failed' in read('deno-final')
assert all(value in read('native-final') for value in (
    '"guardedRefreshes":1', '"refusedNativeChanges":3', '"sends":0',
    '"restorationSeparatelyConfirmed":true', '"errors":[]', 'OK (chromium)'))
assert 'All matched files use Prettier code style!' in read('format-final')
assert all(not read(name).strip() for name in ('lint-final', 'secrets-final', 'diff-final'))
assert 'ERROR:' not in read('duplication-final')
sources = changed_sources(root) + evidence_logs(root, 'ci-limit-expiry')
sources += ['ci-logs/checks-43600700798-chromium-2.log',
            'ci-logs/hh-discovery-parent-chromium-2-job.json',
            'ci-logs/artifacts-43600700798-chromium-2/summary.json',
            'experiments/issue-56/application_parent_fixture.py']
sources += [str(path.relative_to(root)) for path in
            (logs / 'ci-limit-expiry-native-shots').glob('*.png')]
parent = 'ef99739ba4f2684d7714c456f794caa004dbe41c'
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-limit-expiry.tar.gz', {
    'published_parent': parent, 'hosted_failure_head': 'c976dc98',
    'hosted_run': 43600700798, 'hosted_job': 132465586203,
    'hosted_exact_timing_measured': False,
    'parent_cases': 2, 'parent_failures': 1, 'node_pass': 65, 'deno_pass': 65,
    'native_chromium': 1, 'guarded_refreshes': 1, 'sends': 0,
    'original_inventory_unchecked': 81, 'issue_complete': False,
    'exact_head_ci_required': True,
}, 'ci-limit-expiry-*.png', before={
    'js/src/jobs/application-limit-wait.js': parent,
})
