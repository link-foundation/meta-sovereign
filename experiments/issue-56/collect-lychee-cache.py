"""Preserve exact failed hosted attempts and finite strict cache verification."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'lychee-cache')
verify_evidence(read, {
    'before': ['Ran 5 tests', 'FAILED (failures=1)', 'actions/cache/restore@'],
    'focused': ['Ran 5 tests', '\nOK\n', '"exitCode": 2', '"/expires", 404'],
    'report': ['tests 1', 'pass 1', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'parser': ['Workflow parses; strict status, expiry, exclusion and final failure policy retained.'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('secrets', 'diff'))
parent = subprocess.check_output(['git', 'rev-parse', '502b0b07'], cwd=root).decode().strip()
sources = [
    '.github/workflows/links.yml', 'lychee.toml',
    'experiments/issue-56/lychee-cache-policy.py',
    'experiments/issue-56/collect-lychee-cache.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-link-cache.md',
    'js/scripts/lychee-report.mjs', 'js/tests/lychee-report.test.js',
    'ci-logs/broken-links-44184759939.log',
    'ci-logs/broken-links-44184759939-attempt2.log',
    'ci-logs/1b449fb5-link-recheck-direct.log',
    'ci-logs/502b0b07-links-success.log',
    'ci-logs/lychee-cache-upstream/cache.rs',
    'ci-logs/lychee-cache-upstream/cache-readme.md',
    'ci-logs/lychee-nightly-release.json', 'ci-logs/lychee-nightly-tag.json',
    *evidence_logs(root, 'lychee-cache'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
entries['before/.github/workflows/links.yml'] = subprocess.check_output([
    'git', 'show', f'{parent}:.github/workflows/links.yml'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, failedHead='1b449fb54827614b32840fb54ecdef531f3eb1b0',
    failedRun=44184759939, failedAttempts=[1, 2],
    nativeChecks=4, workflowChecks=1, parentWorkflowFailures=1,
    unchangedNativeControls=4, reportChecks=1, hostedVerificationPending=True,
    acceptedCriteria=83, unfinishedCriteria=35, issueComplete=False,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/lychee-cache.tar.gz', entries)
