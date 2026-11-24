"""Preserve actual parent admission failures and finite native browser receipts."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = subprocess.check_output(['git', 'rev-parse', '3fee602d'], cwd=root).decode().strip()
assert 'fail 4' in (logs / 'application-answer-approval-parent.log').read_text()
assert '1 !== 0' in (logs / 'application-answer-approval-parent-browser.log').read_text()
checks = (logs / 'application-answer-approval-compatibility.log').read_text()
assert 'pass 36' in checks and 'fail 0' in checks
assert not (logs / 'application-answer-approval-lint.log').read_text().strip()
browser = (logs / 'application-answer-approval-browser.log').read_text()
assert '[e2e-job-application] OK (chromium)' in browser
for name in ['whole', 'unapproved', 'conflicting']:
    assert json.dumps({
        'name': name, 'automaticSubmissions': 0, 'automaticWrites': 0,
        'reviewedSubmissions': 1, 'ownedBrowserClosed': True,
    }, separators=(',', ':')) in browser
assert '[e2e-application-approved] OK (chromium)' in (
    logs / 'application-answer-approval-approved-browser.log').read_text()
production = [
    'js/src/forms/answer-plan.js', 'js/src/jobs/application-actions.js',
    'js/src/jobs/application-continuation-fields.js', 'js/src/jobs/application-review.js',
]
names = [
    *production, 'js/tests/job-application-answer-approval.test.js',
    'js/tests/helpers/e2e-application-answer-approval.mjs',
    'js/tests/e2e-job-application-browser.mjs',
    'experiments/issue-56/application-fixture.mjs',
    'experiments/issue-56/application-native-fixture.mjs',
    'experiments/issue-56/application-approved-browser.mjs',
    'experiments/issue-56/collect-application-answer-approval.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/application-answer-approval.md',
    *[f'docs/QUESTIONNAIRES{suffix}.md' for suffix in ['', '.ru', '.zh', '.hi']],
]
entries = {name: (root / name).read_bytes() for name in names}
for name in production:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
for path in sorted(logs.glob('application-answer-approval-*')):
    if path.is_file() and path.suffix == '.log' and not path.name.endswith(
            ('-commit.log', '-push.log', '-archive.log')):
        entries[str(path.relative_to(root))] = path.read_bytes()
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'focusedChecks': 36, 'newAdmissionChecks': 4,
    'browserCases': ['whole', 'unapproved', 'conflicting', 'approved native prefill'],
    'localBrowser': 'focused Chromium only', 'liveProvider': False,
    'criterionAccepted': False, 'originalIssueComplete': False,
    'hostedVerification': 'required on the published correction',
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (root / 'docs/screenshots').glob('issue-56-application-approval-*.png')},
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-answer-approval.tar.gz', entries)
