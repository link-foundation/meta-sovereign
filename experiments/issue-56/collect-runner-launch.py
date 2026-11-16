"""Retain the documented session contract without running upstream code."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = 'a3f526213951ff156f009c36d1d86ef4fb1bc24f'
assert "'--name'" in (logs / 'runner-launch-before.log').read_text()
assert "'--session'" in (logs / 'runner-launch-before.log').read_text()
assert 'configured start session' in (logs / 'runner-launch-after.log').read_text()
node = (logs / 'runner-launch-node.log').read_text()
assert 'pass 19' in node and 'fail 0' in node
assert not (logs / 'runner-launch-lint.log').read_text().strip()
assert not (logs / 'runner-launch-diff.log').read_text().strip()
names = changed_sources(root, revision=parent)
names += evidence_logs(root, 'runner-launch')
names += ['ci-logs/runner-launch-upstream-body.md',
          'ci-logs/runner-preparation-start-args.js',
          'ci-logs/runner-preparation-start-screen.js',
          'ci-logs/runner-preparation-start-README.md',
          'ci-logs/vk-desktop-reference-lifecycle.source',
          'ci-logs/vk-desktop-reference-ssh.source',
          'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/js/src/server/runner-session.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/server/runner-session.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'issue_complete': False, 'remaining_rows': 60,
    'focused_tests': 19, 'upstream_executed': False,
    'upstream_start': '3872bd031f5b51902e20bd22b84e9d51a59fcc0b',
    'upstream_report': 'https://github.com/konard/vk-bot-desktop/issues/59',
    'hosted_acceptance': 'pending',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-launch.tar.gz', entries)
