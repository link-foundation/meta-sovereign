"""Bind rejected safeguard saves and non-replaying recovery to exact sources."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive, verify_evidence

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'safety-settings-{name}.log').read_text()
verify_evidence(read, {
    'before': ['fail 4'],
    'web-before': ['fail 5'],
    'focused': ['pass 46', 'fail 0'],
    'registry': ['pass 31', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('final-lint', 'secrets', 'diff'))
parent = subprocess.check_output(['git', 'rev-parse', '62e7c474'], cwd=root).decode().strip()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip() == parent
hashes = json.loads((logs / 'safety-settings-before-hashes.json').read_text())
api = 'js/src/web/automation-api.js'
assert hashes['correctedSha256'] == hashlib.sha256((root / api).read_bytes()).hexdigest()
assert hashes['parentSha256'] == hashlib.sha256(subprocess.check_output(
    ['git', 'show', f'{parent}:{api}'], cwd=root)).hexdigest()
native = [json.loads(line.removeprefix('[browser-scenario] '))
          for line in read('native').splitlines() if line.startswith('[browser-scenario] ')]
assert [row['phase'] for row in native] == ['started', 'passed']
assert native[1]['result'] == dict(acknowledged=1, refused=1, lostResponse=1,
    puts=3, draftRetained=True, pendingControlsDisabled=True, falseSaved=0,
    pageErrors=0, sends=0, liveProvider=False)
def receipt(name):
    result = json.loads((logs / f'safety-settings-mcp-{name}.json').read_text())
    return json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
before, after = receipt('before'), receipt('after')
assert before == dict(shownSaved=1, retainedOptOut=1, liveProvider=False)
assert after == dict(shownSaved=0, retainedOptOut=1, draft='777',
    error='Settings were not confirmed. Your changes have not been marked as saved.', liveProvider=False)
drained = json.loads(read('mcp-server-final').splitlines()[-1])
assert drained['resourcesClosed'] and drained['sends'] == 0 and not drained['liveProvider']
names = [name for name in changed_sources(root)
         if name != 'js/src/web/app.min.js' and not name.endswith(('PLAN.md', 'README.md'))]
names += ['js/src/storage/acknowledged-record.js', 'js/src/storage/serialized.js',
          'js/src/automation/outbox.js', 'js/src/server/routes-automations.js',
          'js/src/web/connections/use-acknowledged-resource.js',
          'js/src/web/dom.js', 'js/src/transport/lino.js',
          'js/tests/helpers/e2e-browser-scenarios.mjs',
          'js/tests/helpers/vk-automation-browser.mjs',
          'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/question-api-links-server.mjs',
          *evidence_logs(root, 'safety-settings')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/automation/safety.js', api, 'js/src/web/automations-safety.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['QA19', 'QA20'], acceptance=False, acceptedCriteria=82,
    unfinishedCriteria=36, nativeResult=native[1], mcpBefore=before,
    mcpAfter=after, liveProvider=False, hostedVerificationPending=True,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/safety-settings-acknowledgement.tar.gz', entries)
