"""Retain native appearance evidence without accepting broader configuration."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import evidence_logs, verify_evidence, write_hashed_archive

root = Path(__file__).resolve().parents[2]
prefix = 'desktop-appearance'
logs = root / 'ci-logs'
verify_evidence(lambda name: (logs / f'{prefix}-{name}.log').read_text(), {
    'browser': ['[e2e-desktop-appearance] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
})
records = [json.loads(line.removeprefix('[browser-scenario] '))
           for line in (logs / f'{prefix}-browser.log').read_text().splitlines()
           if line.startswith('[browser-scenario] ')]
assert [record['phase'] for record in records] == ['started', 'passed']
assert records[1]['result'] == dict(
    detectedLocales=['ru', 'en'], explicitLocaleRetained=True, localeReset=True,
    themeModes=3, systemChanges=2, explicitThemeRetained=True, runnerCalls=0,
    pageErrors=0, liveProvider=False)
names = [
    *[f'js/src/web/{name}.js' for name in (
        'appearance', 'i18n', 'language-switcher', 'settings-view',
        'settings-runner', 'settings-runner-feedback', 'runner-view-state')],
    'js/electron/lifecycle.js', 'js/src/cli/startup-configuration.js',
    'js/tests/appearance.test.js', 'js/tests/desktop-lifecycle.test.js',
    'js/tests/helpers/e2e-desktop-appearance.mjs',
    'js/tests/helpers/e2e-page-errors.mjs',
    'js/tests/helpers/e2e-runner-sessions.mjs',
    'js/tests/helpers/e2e-runner-feedback.mjs',
    'js/tests/e2e-desktop-appearance-browser.mjs',
    'experiments/issue-56/runner-api-fixture.mjs',
    'experiments/issue-56/collect-desktop-appearance.py',
    'experiments/issue-56/evidence_bundle.py',
    'js/scripts/browser-checks.json', 'package.json',
    'docs/case-studies/issue-56/desktop-appearance.md',
    *evidence_logs(root, prefix),
    *[str(path.relative_to(root)) for path in
      (root / 'docs/screenshots/issue-56-desktop-appearance').glob('*.png')],
]
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/desktop-appearance.tar.gz', names,
    dict(parent=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root)
         .decode().strip(), criterion='VD06', acceptance=False,
         nativeResult=records[1], liveProvider=False), None)
