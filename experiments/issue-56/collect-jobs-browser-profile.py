"""Preserve actual-parent failures and focused owned-profile regressions."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
prefix = 'jobs-browser-profile'
verify_evidence(lambda name: (logs / f'{prefix}-{name}.log').read_text(), {
    'parent': ['pass 0', 'fail 5', 'HH application-open', '+ undefined'],
    'node': ['pass 14', 'fail 0'],
    'compatibility': ['pass 28', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('lint-final', 'secrets', 'diff'))
names = [
    'js/src/jobs/browser-profile.js', 'js/src/jobs/browser-dependencies.js',
    'js/src/jobs/service.js', 'js/src/jobs/application-service.js',
    'js/src/jobs/cv-watch-browser.js', 'js/src/cv/browser.js',
    'js/src/browser/policy.js', 'js/src/storage/app-directory.js',
    'js/tests/jobs-browser-session.test.js', 'js/tests/jobs-browser-profile.test.js',
    'js/tests/vacancy-controls.test.js', 'js/tests/job-application-ownership.test.js',
    'js/tests/cv-save-watch.test.js', 'js/tests/cv-prepare-controls.test.js',
    'experiments/issue-56/collect-jobs-browser-profile.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/jobs-browser-profile.md',
    *evidence_logs(root, prefix),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/jobs/service.js', 'js/src/jobs/application-service.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'5512acf2:{name}'], cwd=root)
entries['metadata.json'] = json.dumps(dict(
    parent='5512acf2', criterion='HH01', acceptance=False,
    parentFailures=5, focusedChecks=14, compatibilityChecks=28,
    liveProvider=False, profileMoves=0,
)).encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/jobs-browser-profile.tar.gz', entries)
