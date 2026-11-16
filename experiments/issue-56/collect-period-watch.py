"""Archive the failed hosted watcher assertion and finite phase reproduction."""
import hashlib
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'period-watch-observer')
for phase in ['before', 'parent']:
    assert 'tests 1' in read(phase) and 'fail 1' in read(phase), phase
assert 'pass 10' in read('focused') and 'fail 0' in read('focused')
assert '1 passed | 0 failed' in read('deno')
assert all(f"phase: '{phase}'" in read('after') for phase in ['ready', 'prefilled', 'owner-draft'])
assert not read('lint').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'ERROR:' not in read('duplication')
sources = evidence['changed_sources'](root, '4e7a10d9')
names = [*sources, *evidence['evidence_logs'](root, 'period-watch-observer'),
         'ci-logs/0e676-deno-133681243959.log', 'ci-logs/0e676-deno-133681243959.json',
         'ci-logs/period-watch-observer-before.test.js']
evidence['bundle'](root, names, 'docs/case-studies/issue-56/data/ci-period-watch-observer.tar.gz', {
    'acceptance': False, 'productionChanges': False, 'focusedNodeTests': 10,
    'focusedDenoTests': 1, 'sourceHashes': {
        name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'reproduction': 'Exact published test with one deterministic later-phase synchronization',
    'pending': 'Fresh exact-source hosted checks and all 41 unchecked original requirements',
}, 'unused-period-watch-observer-*.png', before={
    'js/tests/question-period-workers.test.js': '0e676ed0',
})
