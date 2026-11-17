"""Bind distinct UI opt-out scopes to actual failed-parent and corrected evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'safety-person-{name}.log').read_text()
verify_evidence(read, {
    'before': ['"scenario":"verifySafetyOptOutPerson","phase":"failed"',
               'data-field=optout-kind', 'Timeout 10000ms exceeded'],
    'focused': ['pass 46', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('lint-final', 'secrets', 'diff'))

def scenarios(name):
    return [json.loads(line.removeprefix('[browser-scenario] '))
            for line in read(name).splitlines() if line.startswith('[browser-scenario] ')]

native = scenarios('native')
assert [(item['scenario'], item['phase']) for item in native] == [
    (name, phase) for name in ['verifySafetySettings', 'verifySafetyCooldown',
                             'verifySafetyOptOutPerson'] for phase in ['started', 'passed']]
expected = dict(acknowledged=2, refused=1, puts=3, reloads=2,
    scopes=['chat', 'contact'], sameIdentifier='201', refusedDraftRetained=True,
    preciseRemoval=True, pageErrors=0, sends=0, liveProvider=False)
assert native[-1]['result'] == expected
final = scenarios('native-final')
assert [item['phase'] for item in final] == ['started', 'passed']
assert final[-1]['result'] == expected

def receipt(name):
    response = json.loads((logs / f'safety-person-mcp-{name}.json').read_text())
    return json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])

before, initial, after = receipt('before'), receipt('after-initial'), receipt('after')
assert before == dict(scopeControls=0, personControls=0,
    misleadingLabel='Chat or person id', liveProvider=False)
rows = ['Chat vk:201 Owner opt-outRemove', 'Person vk:201 Person across chatsRemove']
assert initial['rows'] == rows and initial['errors'] == [] and not initial['liveProvider']
assert after['rowsBefore'] == rows and after['rowsAfter'] == rows[:1]
assert [item['locale'] for item in after['translated']] == ['en', 'ru', 'hi', 'zh']
assert after['viewportFits'] and after['pageErrors'] == [] and not after['liveProvider']
for phase in ['before', 'after']:
    assert json.loads(read(f'mcp-{phase}-server').splitlines()[-1]) == dict(
        sends=0, liveProvider=False, resourcesClosed=True)

parent = subprocess.check_output(['git', 'rev-parse', 'd3513d39'], cwd=root).decode().strip()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip() == parent
names = [name for name in changed_sources(root)
         if name != 'js/src/web/app.min.js' and '__pycache__' not in Path(name).parts
         and not name.endswith(('PLAN.md', 'README.md'))]
names += ['js/src/automation/safety.js', 'js/src/automation/outbox.js',
          'js/src/cli/safety-commands.js', 'js/src/server/routes-automations.js',
          'js/src/web/safety-settings-api.js',
          'js/tests/safety-cli.test.js', 'js/tests/safety-settings-acknowledgement.test.js',
          'js/tests/helpers/e2e-browser-scenarios.mjs',
          'js/tests/helpers/vk-automation-browser.mjs',
          'experiments/issue-56/safety-settings-fixture.mjs',
          'experiments/issue-56/evidence_bundle.py', *evidence_logs(root, 'safety-person')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
component = 'js/src/web/automations-safety.js'
entries[f'before/{component}'] = subprocess.check_output(['git', 'show', f'{parent}:{component}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, criterion='QA19',
    acceptance=False, acceptedCriteria=83, unfinishedCriteria=35,
    nativeResults=[item for item in native if item['phase'] == 'passed'],
    finalNativeResult=expected, mcpBefore=before, mcpAfter=after,
    liveProvider=False, hostedVerificationPending=True,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/safety-person.tar.gz', entries)
