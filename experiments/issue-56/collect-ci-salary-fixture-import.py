"""Preserve the optional browser dependency leak and portable fixture correction."""
import evidence_bundle as evidence

root, logs, read = evidence.evidence_context(__file__, 'ci-salary-fixture-import')
assert 'TS2307' in read('before') and 'Type checking failed' in read('before')
evidence.verify_evidence(read, {
    'deno': ['6 passed', '0 failed'],
    'node': ['pass 6', 'fail 0'],
    'browser': ['[salary-browser-vacancy-card]', '"textSends":0',
                '"reads":0', '"resourcesClosed":true', 'OK (chromium)'],
    'format': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
failed = (logs / 'ed68-deno-windows-2.log').read_text()
assert 'TS2307' in failed and 'salary-vacancy-browser-fixture.mjs' in failed
paths = [
    'experiments/issue-56/salary-vacancy-fixture.mjs',
    'experiments/issue-56/salary-vacancy-card-fixture.mjs',
    'js/tests/salary-browser-vacancy-card.test.js',
]
evidence.bundle(root, [*evidence.changed_sources(root),
                      *evidence.evidence_logs(root, 'ci-salary-fixture-import'),
                      'ci-logs/ed68-deno-windows-2.log',
                      'ci-logs/ed68-current-jobs.json'],
                'docs/case-studies/issue-56/data/ci-salary-fixture-import.tar.gz',
                dict(acceptance=False, failedSource='ed68e6658a590e4bd0c2195de14605ce5ce5fc6f',
                     focusedTestsPerRuntime=6, submissions=0,
                     pending='Current hosted verification and all 40 original criteria'),
                'unused-salary-fixture-import', before=dict.fromkeys(paths, 'ed68e665'))
