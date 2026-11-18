"""Preserve the finite birthday-history pointer regression and its limits."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'birthday-selection')
for phase, moved, selected in [('before', True, '43'), ('after', False, '42')]:
    lines = read(phase).splitlines()
    receipt = json.loads(next(line.split('] ', 1)[1] for line in lines
                             if line.startswith('[birthday-selection-receipt]')))
    assert receipt == dict(heldHistoryDuringPress=True, transientReminder=moved,
                           rowMoved=moved, selected=selected, deadlineChanged=False)
    assert any('OK (webkit)' in line for line in lines)
assert all(value in read('focused') for value in ('tests 8', 'pass 8', 'fail 0', 'cancelled 0'))
assert not read('lint-final').strip() and not read('secrets').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
report = 'ci-logs/duplication-birthday-selection/jscpd-report.json'
assert json.loads((root / report).read_text())['statistics']['total']['percentage'] <= 6.5
result = json.loads((logs / 'birthday-selection-mcp-result.json').read_text())
receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt == dict(selected='telegram:42', birthdayState='ready', pageErrors=[], liveProvider=False)
server = json.loads(read('mcp-server').splitlines()[-1])
assert server == dict(sends=0, resourcesClosed=True, liveProvider=False)
names = changed_sources(root)
names += [report, '.jscpd.json', 'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/previous-module.mjs', 'experiments/issue-56/published-web-bundle.mjs',
          'ci-logs/hosted-ef34179a-webkit-8.log', 'ci-logs/profile-selection-probe.log',
          *evidence_logs(root, 'birthday-selection')]
names += [str(path.relative_to(root)) for path in
          (logs / 'hosted-ef34179a-webkit-8-artifacts').rglob('*') if path.is_file()]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = 'ef34179a'
for name in ['js/src/web/chat-birthday-reminders.js', 'js/src/web/chat-person-extras.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, acceptance=False,
    acceptedCriteria=88, unfinishedCriteria=30, focusedPasses=8,
    actualHostedTimingProven=False, hostedVerificationPending=True,
    deterministicBeforeReproduced=True, nativeAfterPassed=True, liveProvider=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/birthday-selection.tar.gz', entries)
