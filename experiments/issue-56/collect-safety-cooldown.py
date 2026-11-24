"""Bind the missing UI control to exact sources and acknowledged reload evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'safety-cooldown-{name}.log').read_text()
verify_evidence(read, {
    'before': ['"scenario":"verifySafetyCooldown","phase":"failed"',
               'data-field=safety-cooldown', 'Timeout 10000ms exceeded'],
    'focused': ['pass 48', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('lint', 'secrets', 'diff'))
native = [json.loads(line.removeprefix('[browser-scenario] '))
          for line in read('native').splitlines() if line.startswith('[browser-scenario] ')]
assert [(item['scenario'], item['phase']) for item in native] == [
    ('verifySafetySettings', 'started'), ('verifySafetySettings', 'passed'),
    ('verifySafetyCooldown', 'started'), ('verifySafetyCooldown', 'passed')]
assert native[3]['result'] == dict(saved=5.5, reset=None, invalidWrites=0,
    puts=2, reloads=2, retainedSafeguards=True, pageErrors=0, sends=0, liveProvider=False)
layout = [json.loads(line.removeprefix('[browser-scenario] '))
          for line in read('native-layout-final').splitlines() if line.startswith('[browser-scenario] ')]
assert [item['phase'] for item in layout] == ['started', 'passed']
assert layout[1]['result'] == native[3]['result']
def receipt(phase):
    response = json.loads((logs / f'safety-cooldown-mcp-{phase}.json').read_text())
    return json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
before, after = receipt('before'), receipt('after')
assert before == dict(cooldownControls=0, liveProvider=False)
assert after == dict(cooldownControls=1, saved='5.5', reloaded='5.5',
    translated=['en', 'ru', 'hi', 'zh'], viewportFits=True,
    pageErrors=[], liveProvider=False)
for name in ['mcp-server', 'mcp-after-server']:
    assert json.loads(read(name).splitlines()[-1]) == dict(
        sends=0, liveProvider=False, resourcesClosed=True)
parent = subprocess.check_output(['git', 'rev-parse', '29d36993'], cwd=root).decode().strip()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip() == parent
names = [name for name in changed_sources(root)
         if name != 'js/src/web/app.min.js' and '__pycache__' not in Path(name).parts
         and not name.endswith(('PLAN.md', 'README.md'))]
names += ['js/src/automation/safety.js', 'js/src/automation/automations.js',
          'js/src/storage/acknowledged-record.js', 'js/src/storage/serialized.js',
          'js/src/cli/safety-commands.js', 'js/src/server/routes-automations.js',
          'js/src/web/safety-settings-api.js',
          'js/tests/safety-cli.test.js', 'js/tests/send-safety.test.js',
          'js/tests/safety-settings-acknowledgement.test.js',
          'js/tests/helpers/e2e-browser-scenarios.mjs',
          'js/tests/helpers/vk-automation-browser.mjs',
          'experiments/issue-56/evidence_bundle.py', *evidence_logs(root, 'safety-cooldown')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
component = 'js/src/web/automations-safety.js'
entries[f'before/{component}'] = subprocess.check_output(['git', 'show', f'{parent}:{component}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, criterion='QA19',
    acceptance=False, acceptedCriteria=82, unfinishedCriteria=36,
    nativeResults=[item for item in native if item['phase'] == 'passed'],
    mcpBefore=before, mcpAfter=after, liveProvider=False,
    hostedVerificationPending=True,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/safety-cooldown.tar.gz', entries)
