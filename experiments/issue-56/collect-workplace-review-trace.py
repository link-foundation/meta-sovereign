"""Preserve the hosted refusal and bounded diagnostics without claiming a repair."""
from evidence_bundle import evidence_context, bundle, verify_evidence

root, logs, read = evidence_context(__file__, 'ci-workplace-review')
verify_evidence(read, {
    'webkit-initial': ['"cases":4', '[e2e-cv-workplace-fields] OK (webkit)'],
    'webkit-traced': ['"phase":"fields-loaded"', '"status":200',
                      '"attached":7,"detached":7', '"saves":0',
                      '[e2e-workplace-review-trace] OK (webkit)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'diff'))
failed = (logs / 'checks-release-44047174048-webkit-2.log').read_text()
assert 'locator.waitFor: Timeout 30000ms exceeded.' in failed
assert 'e2e-cv-workplace-fields.mjs:26:53' in failed
bundle(root, [
    '.github/workflows/release.yml',
    'js/tests/helpers/e2e-cv-workplace-fields.mjs',
    'js/tests/helpers/e2e-cv-workplace-trace.mjs',
    'experiments/issue-56/workplace-review-trace.mjs',
    'experiments/issue-56/collect-workplace-review-trace.py',
    'docs/case-studies/issue-56/ci-workplace-review-trace.md',
    *[str(path.relative_to(root)) for pattern in [
        'ci-workplace-review-*.log', 'checks-release-44047174048*',
        'current-94efd84b-*.json',
    ] for path in logs.glob(pattern) if path.is_file()],
], 'docs/case-studies/issue-56/data/ci-workplace-review-trace.tar.gz', {
    'acceptance': False,
    'failedSource': '94efd84bfcd43304d4986494efded5652bb889ec',
    'localFocusedCases': 4, 'historicalCause': 'unconfirmed',
    'pending': 'Fresh exact-source hosted verification and all 40 original criteria',
}, 'unused-workplace-trace-pattern', before={
    'js/tests/helpers/e2e-cv-workplace-fields.mjs': '9849c6e5',
})
