"""Preserve the bounded lost-click regression without asserting hosted timing."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'application-background')
assert all(part in read('before') for part in ('tests 7', 'pass 4', 'fail 3', 'cancelled 0'))
assert all(part in read('after') for part in ('tests 7', 'pass 7', 'fail 0', 'cancelled 0'))
assert all(part in read('focused') for part in ('tests 39', 'pass 39', 'fail 0', 'cancelled 0'))
for name, disabled, requests in [('native-before', True, 0), ('native-after', False, 1)]:
    lines = read(name).splitlines()
    assert lines[-1] == '[restore-probe] all browsers closed'
    receipt = json.loads(lines[-2])
    assert receipt['disabledDuringPress'] is disabled
    assert receipt['restoreRequests'] == requests
    assert receipt['entries'] == 1 and receipt['sends'] == 0
    assert receipt['backgroundReadDuringPointerPress'] and not receipt['errors']
assert '0 errors' in read('lint-final')
assert 'All matched files use Prettier code style!' in read('format-check')
assert not read('secrets').strip() and not read('diff').strip()
report = 'ci-logs/duplication-application-background/jscpd-report.json'
assert json.loads((root / report).read_text())['statistics']['total']['percentage'] <= 6.5
response = json.loads((logs / 'application-background-mcp-result.json').read_text())
receipt = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt['ownerReads'] == 1 and receipt['disabledDuringPress'] is False
assert receipt['closed'] and receipt['outcomes'][0]['attempts'] == 0
assert receipt['errors'] == receipt['pageErrors'] == [] and not receipt['liveProvider']
assert '"resourcesClosed":true' in read('mcp-server')
names = [name for name in changed_sources(root) if 'profile-selection-probe' not in name]
names += [report, '.jscpd.json', 'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/previous-module.mjs', 'experiments/issue-56/published-web-bundle.mjs',
          'js/tests/helpers/application-panel-browser.mjs',
          'ci-logs/hosted-ef34179a-webkit-6.log',
          'ci-logs/hosted-ef34179a-webkit-6-artifacts/application-limit-wait-failed.png',
          '.playwright-mcp/console-2026-11-18T19-54-47-820Z.log',
          *evidence_logs(root, 'application-background')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = 'ef34179a'
for name in ['js/src/web/application-session.js', 'js/src/web/application-state.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, acceptance=False,
    acceptedCriteria=88, unfinishedCriteria=30, focusedPasses=39,
    parentFailures=3, parentControls=4, liveProvider=False,
    hostedFailureSchedulingProven=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-background-status.tar.gz', entries)
