"""Preserve checked native delivery observations and exact-parent regressions."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = 'bea3183ee94d04d0cb51b3961b0db08d84ef01c7'
before = (logs / 'hh-delivery-before.log').read_text()
assert 'node: 3 actual-parent failures' in before
assert 'native: 3 actual-parent failures' in before
node = (logs / 'hh-delivery-node.log').read_text()
assert 'pass 88' in node and 'fail 0' in node
native = (logs / 'hh-delivery-native.log').read_text()
assert native.count('[hh-choices] PASS') == 8
assert json.loads(native.splitlines()[-1]) == {
    'cases': 8, 'pageErrors': [], 'liveProvider': False,
}
mcp = json.loads((logs / 'hh-delivery-mcp.json').read_text())
assert not mcp.get('isError')
result = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result == {
    'states': ['unknown', 'pending', 'failed', 'unknown', 'unknown', 'sent', 'delivered', 'read'],
    'pendingRefused': True, 'sameAttemptConfirmed': True,
    'counts': {'clicks': 1, 'text': 0}, 'errors': [], 'liveProvider': False,
}
assert 'Errors: 0' in (logs / 'hh-delivery-mcp-console.log').read_text()
assert json.loads((logs / 'hh-delivery-mcp-server.log').read_text().splitlines()[-1]) == {
    'resourcesClosed': True, 'providerEffects': 0,
}
for suffix in ['lint', 'secrets', 'diff']:
    assert not (logs / f'hh-delivery-{suffix}.log').read_text().strip()
names = changed_sources(root, revision=parent)
names += evidence_logs(root, 'hh-delivery')
names += ['ci-logs/hh-delivery-mcp-code.js',
          'ci-logs/hh-reference-chat-recording.mjs.source',
          'ci-logs/hh-reference-chat-history.mjs.source',
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
    'focused_node_checks': 88, 'parent_failures': 6,
    'native_history_cases': 8, 'mcp_delivery_states': 8,
    'node_heap_mib': 384, 'live_provider_effects': 0,
    'continuous_dom_capture': False, 'authenticated_parity': False,
    'hosted_acceptance': 'pending',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/hh-browser-delivery.tar.gz', entries)
