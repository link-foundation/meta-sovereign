"""Keep actual synthetic-cookie restart evidence without accepting HH01."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import evidence_logs, verify_evidence, write_hashed_archive

root = Path(__file__).resolve().parents[2]
prefix = 'jobs-browser-cookie'
logs = root / 'ci-logs'
verify_evidence(lambda name: (logs / f'{prefix}-{name}.log').read_text(), {
    'browser': ['[e2e-jobs-browser-profile] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('lint', 'secrets', 'diff'))
records = [json.loads(line.removeprefix('[browser-scenario] '))
           for line in (logs / f'{prefix}-browser.log').read_text().splitlines()
           if line.startswith('[browser-scenario] ')]
assert [value['phase'] for value in records] == ['started', 'passed']
assert records[1]['scenario'] == 'verifyJobBrowserProfiles'
assert records[1]['result'] == dict(launches=4, sessionCookieRetained=True,
    slotIsolated=True, workspaceIsolated=True, headless=True, liveProvider=False)
names = [
    'experiments/issue-56/jobs-browser-cookie.mjs',
    'experiments/issue-56/collect-jobs-browser-cookie.py',
    'experiments/issue-56/evidence_bundle.py',
    'js/tests/helpers/e2e-jobs-browser-profile.mjs',
    'js/tests/helpers/e2e-browser-scenarios.mjs',
    'js/tests/helpers/fixture-server.mjs',
    'js/tests/e2e-jobs-browser-profile-browser.mjs',
    'js/src/jobs/browser-profile.js', 'js/src/jobs/browser-dependencies.js',
    'js/src/cv/browser.js', 'js/src/browser/policy.js',
    'js/scripts/browser-checks.json', 'package.json',
    'docs/case-studies/issue-56/jobs-browser-cookie.md',
    *evidence_logs(root, prefix),
]
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/jobs-browser-cookie.tar.gz', names,
    dict(parent=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root)
         .decode().strip(), criterion='HH01', acceptance=False,
         nativeResult=records[1], liveProvider=False), None)
