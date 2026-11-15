"""Keep the actual failing hosted fixture and finite clock regression."""
import subprocess
from evidence_bundle import evidence_context, write_entries_archive

root, logs, read = evidence_context(__file__, 'vk-reply-clock')
assert 'fail 1' in read('before') and 'older.timestamp' in read('before')
assert 'pass 24' in read('node') and 'fail 0' in read('node')
assert '24 passed | 0 failed' in read('deno')
assert not read('lint').strip()
names = [
    'experiments/issue-56/vk-gratitude-fixture.mjs',
    'experiments/issue-56/collect-vk-reply-clock.py',
    'js/tests/vk-reply-fixture.test.js',
    'docs/case-studies/issue-56/ci-reply-fixture-clock.md',
    'ci-logs/checks-macos-node-43705703714.log',
    'ci-logs/checks-macos-node-shard3-43705703714.log',
    'ci-logs/vk-wall-macos-node-annotations.json',
    'ci-logs/vk-wall-macos-node-shard3-annotations.json',
    'ci-logs/vk-wall-macos-node-shard3-job.json',
    *[str(p.relative_to(root)) for p in logs.glob('vk-reply-clock-*.log')
      if not p.name.endswith('-archive.log')],
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = '05bcbdddaf71edbff1e9dc3c6eb46615ae41599f'
name = 'experiments/issue-56/vk-gratitude-fixture.mjs'
entries[f'before/{name}'] = subprocess.check_output(
    ['git', 'show', f'{parent}:{name}'], cwd=root)
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-reply-fixture-clock.tar.gz', entries)
