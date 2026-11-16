"""Retain the actual parent loss, lifecycle proofs and unchanged CI gate."""
import json
import subprocess
from evidence_bundle import evidence_context, changed_sources, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'unread-live-capture')
parent = 'a5dc8de9efca5d09324cfacc39631b21aee35409'
assert 'transient unread message retained' in read('before')
assert 'actual: undefined' in read('before')
assert 'fail 3' in read('node-before') and 'pass 7' in read('node-before')
assert 'pass 30' in read('node') and 'fail 0' in read('node')
assert '30 passed | 0 failed' in read('deno')
assert 'pass 1' in read('contract') and 'fail 0' in read('contract')
assert json.loads(read('native')) == {
    'cases': 1, 'outcome': 'transient-edits-delivery-drained-before-view-restoration',
    'liveProvider': False,
}
assert json.loads(read('confirmed-native').splitlines()[-1]) == {
    'cases': 4, 'failures': [], 'liveProvider': False,
}
assert read('confirmed-native').count('[hh-live-capture] PASS') == 4
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('check')
assert 'ERROR:' not in read('duplication')
assert 'Total:' in read('duplication')
assert json.loads((logs / 'unread-live-capture-mcp.json').read_text())['isError']
assert 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING' in (
    logs / 'unread-live-capture-mcp.json').read_text()
failure = (logs / 'checks-43804735866-lint.log').read_text()
assert '50191 (6.50%)' in failure and 'over threshold (6.5%)' in failure
runs = json.loads((logs / 'current-runs-a5dc-final.json').read_text())
assert len(runs) == 5 and all(run['headSha'] == parent for run in runs)
assert sum(run['conclusion'] == 'success' for run in runs) == 4
assert next(run for run in runs if run['databaseId'] == 43804735866)['conclusion'] == 'failure'
names = changed_sources(root, revision=parent) + evidence_logs(root, 'unread-live-capture')
names += ['ci-logs/checks-43804735866-lint.log', 'ci-logs/checks-43804735866.log',
          'ci-logs/current-runs-a5dc-final.json',
          'ci-logs/hh-reference-chat-recording.mjs.source',
          'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/question-browser-probe.mjs']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith(('js/src/', 'experiments/issue-56/')):
        found = subprocess.run(['git', 'show', f'{parent}:{name}'], cwd=root,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False)
        if found.returncode == 0:
            entries[f'before/{name}'] = found.stdout
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'acceptedInventoryRows': [], 'remainingRows': 60,
    'focusedNode': 30, 'focusedDeno': 30, 'browserGroupContracts': 1,
    'nativeUnreadCases': 1, 'existingNativeCaptureCases': 4,
    'mcp': 'import unavailable; not verified', 'liveProvider': False,
    'automaticGeneralUnreadQA': False, 'authenticatedParity': False,
    'hostedAcceptance': 'pending', 'duplicationThreshold': 6.5,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/unread-live-capture.tar.gz', entries)
