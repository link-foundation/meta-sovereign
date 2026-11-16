"""Preserve bounded checkpoint/privacy failures, passing checks and native receipts."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = subprocess.check_output(['git', 'rev-parse', '77cf6add'], cwd=root, text=True).strip()
assert 'fail 6' in (logs / 'browser-history-archive-before.log').read_text()
node = (logs / 'browser-history-archive-node.log').read_text()
assert 'pass 109' in node and 'fail 0' in node
native = json.loads((logs / 'browser-history-archive-native-final.log').read_text())
assert native == {
    'cases': 3, 'outcomes': ['native-window-checkpoints',
                           'all-native-rows-survive-reopen',
                           'refused-write-restores-unread-owner'],
    'liveProvider': False,
}
mcp = json.loads((logs / 'browser-history-archive-mcp-current.json').read_text())
assert not mcp.get('isError')
summary = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary == {
    'cases': 2, 'windows': 8, 'uniqueMessages': 12,
    'acknowledgementBeforeMove': True, 'refusedWriteStopped': True,
    'ownerRestored': True, 'errors': [], 'liveProvider': False,
}
assert 'Errors: 0' in (logs / 'browser-history-archive-mcp-console.log').read_text()
for suffix in ['lint', 'secrets', 'diff']:
    assert not (logs / f'browser-history-archive-{suffix}.log').read_text().strip()
names = changed_sources(root, revision=parent)
names += evidence_logs(root, 'browser-history-archive')
names += ['ci-logs/browser-history-archive-mcp-code.js',
          'ci-logs/hh-reference-readme.md',
          'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith('js/src/'):
        result = subprocess.run(['git', 'show', f'{parent}:{name}'], cwd=root,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False)
        if result.returncode == 0:
            entries[f'before/{name}'] = result.stdout
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'issue_complete': False, 'remaining_rows': 60,
    'focused_node_checks': 109, 'parent_failures': 6,
    'native_cases': 3, 'mcp_cases': 2, 'native_messages': 12,
    'node_heap_mib': 384, 'provider_effects': 0,
    'upstream_executed': False, 'continuous_dom_capture': False,
    'hosted_acceptance': 'pending',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-history-archive.tar.gz', entries)
