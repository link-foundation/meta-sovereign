"""Preserve the real CodeQL finding and the bounded semantic regression."""
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'salary-hour-word')
assert 'fail 1' in read('before')
assert 'pass 7' in read('after') and 'fail 0' in read('after')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
names = [
    'js/src/automation/salary-question.js',
    'js/tests/salary-hour-word.test.js',
    'experiments/issue-56/salary-hour-word-before.mjs',
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/collect-salary-hour-word.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-salary-hour-word.md',
    'ci-logs/510479-security-run.json',
    'ci-logs/security-44002566692-javascript.log',
    'ci-logs/codeql-510479-javascript.zip',
]
names += [str(p.relative_to(root)) for p in logs.glob('salary-hour-word-*.log')
          if not p.name.endswith(('-commit.log', '-archive.log'))]
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/ci-salary-hour-word.tar.gz', names,
    dict(acceptance=False, parent='51047939', hostedRun=44002566692,
         hostedJob=133769970218, focusedTests=7,
         exactSourceHostedVerificationRequired=True), 1)
