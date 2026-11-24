"""Preserve exact-head gate failures and the focused registration correction."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'e68448ac0a526e5e62e5f5d178770a166d4e752b'
files = [
    'js/tests/ci-browser-shards.test.js',
    'js/tests/e2e-vacancies-browser.mjs',
    'js/tests/e2e-vacancy-discovery-browser.mjs',
    'js/scripts/browser-checks.json',
    'js/scripts/browser-check-shards.mjs',
    '.github/workflows/release.yml',
    'docs/case-studies/issue-56/ci-search-registration.md',
    'docs/case-studies/issue-56/ci-follow-links-opening.md',
    'docs/case-studies/issue-56/vacancy-observation-history.md',
    'experiments/issue-56/collect-ci-search-registration.py',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/checks-44229077094.log',
    *[f'ci-logs/hosted-e68448ac-{job}.log' for job in [134549749721, 134549749940, 134551369203]],
    *[f'ci-logs/hosted-verification-e68448ac-{name}.json' for name in ['checks', 'desktop', 'pages', 'security', 'links']],
    *[f'ci-logs/ci-search-registration-{name}.log' for name in ['before', 'after', 'format-check', 'lint']],
]
entries = {name: (root / name).read_bytes() for name in files}
for name in ['js/tests/ci-browser-shards.test.js',
             'docs/case-studies/issue-56/ci-follow-links-opening.md',
             'docs/case-studies/issue-56/vacancy-observation-history.md']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
for name in ['checks', 'desktop', 'pages', 'security', 'links']:
    data = json.loads(entries[f'ci-logs/hosted-verification-e68448ac-{name}.json'])
    assert data['headSha'] == parent and data['status'] == 'completed'
    assert data['conclusion'] == ('failure' if name == 'checks' else 'success')
before = entries['ci-logs/ci-search-registration-before.log'].decode()
after = entries['ci-logs/ci-search-registration-after.log'].decode()
assert 'fail 1' in before and 'verifyVacancySearchUrl' in before
assert 'pass 7' in after and 'fail 0' in after
assert 'All matched files use Prettier code style!' in entries['ci-logs/ci-search-registration-format-check.log'].decode()
assert not entries['ci-logs/ci-search-registration-lint.log'].strip()
entries['metadata.json'] = (json.dumps(dict(parent=parent, run=44229077094,
    localChecks=7, localFullSuite=False, issueComplete=False,
    originalGateFailed=True, exactSourceHostedVerificationRequired=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-search-registration.tar.gz', entries)
