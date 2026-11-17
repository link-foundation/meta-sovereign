"""Bind focused manual-login evidence to the complete changed source snapshot."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_hashed_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'job-login-{name}').read_text()
assert 'ℹ pass 37' in read('final-focused.log')
assert 'ℹ fail 0' in read('final-focused.log')
assert 'ℹ fail 2' in read('owner-draft-drained.log')
assert "+   code: 'jobs-login-unavailable'" in read('error-code-draft.log')
assert "-   code: 'jobs-login-visible'" in read('error-code-draft.log')
assert 'browser-open' in read('recovery-draft-targeted.log')
assert 'All matched files use Prettier code style!' in read('format-check.log')
assert '0 over the 1500 line limit' in read('limits.log')
assert '6.49%' in read('duplication.log')
for suffix in ['final-lint.log', 'secrets.log', 'diff.log']:
    assert not read(suffix).strip(), suffix
native = [json.loads(line.removeprefix('[browser-scenario] '))
          for line in read('final-native.log').splitlines()
          if line.startswith('[browser-scenario] ')]
assert [row['phase'] for row in native] == ['started', 'passed']
assert native[1]['result'] == dict(visibleLaunchRequested=True,
    headlessRefused=True, manualFieldsPreserved=True, reloads=1, loginLaunches=1,
    loginClosures=1, statusRecoveryOnly=True, authentication='unverified',
    providerClicks=0, pageErrors=0, liveProvider=False)
assert '"headless":false' in read('headed-native.log')
assert '"sessionCookieRetained":true' in read('headed-native.log')
assert '"slotIsolated":true' in read('profile-compatibility.log')
assert json.loads(read('mcp-clean-drained.json')) == dict(
    opens=1, closed=True, providerClicks=0, pageErrors=[], liveProvider=False)
assert json.loads(read('mcp-clean-reloaded.json')) == dict(
    state='browser-open', slot='manual-mcp', searchDisabled=True)
assert json.loads(read('mcp-clean-closed.json')) == dict(state='closed', canOpen=True)
assert json.loads(read('mcp-clean-phone.json')) == dict(viewport=390, document=390)
names = [name for name in changed_sources(root)
         if name != 'js/src/web/app.min.js' and
         not name.endswith(('PLAN.md', 'README.md'))]
names += ['js/src/jobs/browser-profile.js', 'js/src/jobs/browser-dependencies.js',
          'js/src/cv/browser.js', 'js/src/browser/policy.js',
          'js/src/storage/acknowledged-record.js',
          'js/src/web/workspace-job-state.js',
          'experiments/issue-56/evidence_bundle.py',
          *evidence_logs(root, 'job-login', ('.log', '.json', '.yml', '.js', '.mjs'))]
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/jobs-manual-login.tar.gz', names,
    dict(parent=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root)
         .decode().strip(), criterion='HH01', acceptance=False,
         acceptedCriteria=82, unfinishedCriteria=36,
         nativeResult=native[1], liveProvider=False), None)
