"""Preserve the finite scheduler lifetime regression and focused evidence."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '74e64e425264be1fd095397978a264897e90dcd9'
before = (logs / 'vk-scheduler-before.log').read_text()
assert 'fail 3' in before
assert before.count('The process exited before its scheduled triggers could run') == 3
node = (logs / 'vk-scheduler-node.log').read_text()
assert 'pass 42' in node and 'fail 0' in node
for suffix in ['lint', 'secrets', 'diff']:
    assert not (logs / f'vk-scheduler-{suffix}.log').read_text().strip()
names = changed_sources(root, revision=parent)
names += evidence_logs(root, 'vk-scheduler')
names += ['ci-logs/vk-desktop-reference-requirements.source',
          'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/automation/vk-online.js', 'js/src/automation/vk-friends.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'issue_complete': False, 'remaining_rows': 60,
    'focused_tests': 42, 'parent_failures': 3,
    'child_heap_mib': 128, 'child_deadline_seconds': 8,
    'provider_effects': 0, 'upstream_executed': False,
    'hosted_acceptance': 'pending',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-scheduler.tar.gz', entries)
