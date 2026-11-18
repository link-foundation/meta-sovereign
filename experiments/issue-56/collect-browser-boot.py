"""Retain one hosted failure and bounded snapshot coordination regressions."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '060b17210d84275ebd7e8bfb65d60aefe7c1a77e'
before = (logs / 'browser-boot-before-node.log').read_text()
assert 'pass 0' in before and 'fail 3' in before
after = (logs / 'browser-boot-final-node.log').read_text()
assert 'pass 39' in after and 'fail 0' in after
assert '3 passed | 0 failed' in (logs / 'browser-boot-after-deno.log').read_text()
old_native = json.loads((logs / 'browser-boot-before-native.log').read_text().splitlines()[-1])
assert old_native['regressionFails'] and 'Another tab is saving data' in old_native['error']
native = (logs / 'browser-boot-final-native.log').read_text()
assert '[e2e-browser-merge] OK (chromium)' in native
assert '[browser-boot-queue]' in native
for line in native.splitlines():
    if line.startswith('[browser-tab-merge]'):
        item = json.loads(line.split('] ', 1)[1])
        assert all(value is True for key, value in item.items() if key != 'kind')
assert native.count('[browser-tab-merge]') == 2
for name in ['lint-final', 'diff']:
    assert not (logs / f'browser-boot-{name}.log').read_text().strip()
names = [name for name in changed_sources(root, revision='2332eaf8')
         if name != 'js/src/web/app.min.js']
names += [
    'js/src/storage/browser-store.js', 'js/src/storage/browser-snapshot-writer.js',
    'js/src/storage/browser-coordination.js',
    'js/tests/helpers/browser-storage-fixture.mjs',
    'js/tests/helpers/browser-merge-fixture.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/runner-profile-hosted-chromium-3.log',
    *evidence_logs(root, 'browser-boot'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['browser-snapshot.js', 'open-browser-store.js']:
    source = 'js/src/storage/' + name
    entries['before/' + source] = subprocess.check_output(
        ['git', 'show', f'{parent}:{source}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False, 'remaining_rows': 60, 'acceptance_rows_completed': [],
    'parent': parent, 'focused_checks': {'node': 39, 'deno': 3},
    'published_failure': {'run': 43778308862, 'job': 133011169900,
                          'log_error_lines': [1501, 1506]},
    'native_engine': 'chromium', 'native_two_drivers_verified': True,
    'lock_wait_ms': 2000, 'owned_resources_closed': True,
    'hosted_acceptance': 'pending',
    'invalid_draft_evidence': 'initial native queue probes accepted a Promise with a false resolved value; superseded by awaited poll checks',
    'bundle_sha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-boot-queue.tar.gz', entries)
