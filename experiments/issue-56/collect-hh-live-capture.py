"""Preserve bounded capture, pane ownership and acknowledged Stop evidence."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '7973fe42bff797e7c48631b19421d51b2f2789e6'
before = (logs / 'hh-capture-before.log').read_text()
assert 'node: 2 actual-parent failures' in before
assert 'native: 4 actual-parent failures' in before
for suffix, count in [('node', 41), ('compatibility', 40), ('shutdown', 2)]:
    text = (logs / f'hh-capture-{suffix}.log').read_text()
    assert f'pass {count}' in text and 'fail 0' in text
native = (logs / 'hh-capture-native.log').read_text()
assert native.count('[hh-live-capture] PASS') == 4
assert json.loads(native.splitlines()[-1]) == {
    'cases': 4, 'failures': [], 'liveProvider': False,
}
mcp = json.loads((logs / 'hh-capture-mcp.json').read_text())
assert not mcp.get('isError')
result = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert set(result['versions']) == {'First answer', 'Edited answer', 'Final answer'}
assert result['delivery'] == 'delivered'
assert result['stopDrained'] and result['failedSavePaused']
assert result['counts'] == {'clicks': 0, 'text': 0, 'observer': False}
assert result['errors'] == [] and result['liveProvider'] is False
assert 'Errors: 0, Warnings: 0' in (logs / 'hh-capture-mcp-console.log').read_text()
assert json.loads((logs / 'hh-capture-mcp-server.log').read_text().splitlines()[-1]) == {
    'resourcesClosed': True, 'providerEffects': 0,
}
for suffix in ['lint', 'secrets', 'diff']:
    assert not (logs / f'hh-capture-{suffix}.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (logs / 'hh-capture-check.log').read_text()
names = changed_sources(root, revision=parent)
names += evidence_logs(root, 'hh-capture')
names += ['ci-logs/hh-capture-mcp-code.js',
          'ci-logs/hh-reference-chat-recording.mjs.source',
          'ci-logs/hh-reference-chat-history.mjs.source',
          'ci-logs/hh-reference-chat-answers.mjs.source',
          'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith('js/src/'):
        found = subprocess.run(['git', 'show', f'{parent}:{name}'], cwd=root,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False)
        if found.returncode == 0:
            entries[f'before/{name}'] = found.stdout
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'issue_complete': False, 'remaining_rows': 60,
    'focused_node_checks': 83, 'parent_failures': 6, 'native_cases': 4,
    'node_heap_mib': 384, 'live_provider_effects': 0,
    'confirmed_document_capture': True, 'all_unread_orchestration': False,
    'authenticated_parity': False, 'hosted_acceptance': 'pending',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/hh-live-capture.tar.gz', entries)
