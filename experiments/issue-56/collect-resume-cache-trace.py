"""Preserve actual hosted discovery failure without claiming a timeout repair."""
from evidence_bundle import bundle, evidence_context, verify_evidence

root, logs, read = evidence_context(__file__, 'ci-resume-cache')
verify_evidence(read, {
    'unchanged': ['"resumeRows":3', '"resourcesClosed":true', 'OK (webkit)'],
    'traced': ['"phase":"cache-discovery-clicked"', '"phase":"cache-discovery-loaded"',
               '"action":"resumes"', '"status":200', '"resumeRows":3',
               '"providerClicks":0', '"recoveryReplayed":false',
               '"resourcesClosed":true', 'OK (webkit)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'diff'))
failure = (logs / 'checks-release-44054688918-webkit-1.log').read_text()
assert 'locator.waitFor: Timeout 30000ms exceeded.' in failure
assert 'e2e-resume-cache.mjs:22:23' in failure
workplace = (logs / 'checks-release-44054688918-webkit-2.log').read_text()
assert '"phase":"fields-loaded"' in workplace
assert '"scenario":"verifyCvWorkplaceFields","phase":"passed"' in workplace
bundle(root, [
    'js/tests/helpers/e2e-resume-cache.mjs',
    'js/tests/helpers/e2e-resume-input.mjs',
    'experiments/issue-56/resume-cache-browser.mjs',
    'experiments/issue-56/collect-resume-cache-trace.py',
    'docs/case-studies/issue-56/ci-resume-cache-trace.md',
    '.github/workflows/release.yml',
    *[str(path.relative_to(root)) for pattern in [
        'ci-resume-cache-*.log', 'checks-release-44054688918*',
        'current-ddd08a57-*.json',
    ] for path in logs.glob(pattern) if path.is_file()],
], 'docs/case-studies/issue-56/data/ci-resume-cache-trace.tar.gz', {
    'acceptance': False,
    'failedSource': 'ddd08a57a5d347fc5f09d5d4689411472a421188',
    'historicalCause': 'unconfirmed', 'focusedWebKitPasses': 2,
    'pending': 'Fresh exact-source hosted verification and all 40 original criteria',
}, 'unused-resume-cache-trace-pattern', before={
    'js/tests/helpers/e2e-resume-cache.mjs': 'ddd08a57',
    'js/tests/helpers/e2e-resume-input.mjs': 'ddd08a57',
})
