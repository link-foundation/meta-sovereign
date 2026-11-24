"""Preserve the actual portable mock failure and three focused runtime checks."""
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-resume-input-mock')
assert 'page.on is not a function' in read('before') and 'fail 1' in read('before')
assert 'pass 2' in read('focused') and 'fail 0' in read('focused')
assert '2 pass' in read('bun') and '0 fail' in read('bun')
assert '2 passed' in read('deno') and '0 failed' in read('deno')
failed = ['deno-windows-2', 'bun-linux', 'node-windows-2']
for tag in failed:
    assert 'page.on is not a function' in (logs / f'checks-release-44063257040-{tag}.log').read_text()
bundle(root, [
    'js/tests/resume-input-trace.test.js', 'js/tests/helpers/e2e-resume-input.mjs',
    'docs/case-studies/issue-56/ci-resume-input-mock.md',
    'experiments/issue-56/collect-ci-resume-input-mock.py',
    'ci-logs/current-2ece94b4-main.json',
    *evidence_logs(root, 'ci-resume-input-mock'),
    *[f'ci-logs/checks-release-44063257040-{tag}.log' for tag in failed],
], 'docs/case-studies/issue-56/data/ci-resume-input-mock.tar.gz', {
    'acceptance': False, 'failedSource': '2ece94b4bd51ea3555492abc457052bf79f327e8',
    'parentFailures': 1, 'focusedTestsPerRuntime': 2, 'runtimes': ['node', 'bun', 'deno'],
    'historicalDiscoveryCause': 'unconfirmed', 'pending': 'Fresh hosted verification and all 40 original criteria',
}, 'unused-resume-input-mock-pattern', before={
    'js/tests/resume-input-trace.test.js': '2ece94b4',
})
