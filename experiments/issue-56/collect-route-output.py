"""Preserve the exact hosted parse failure and finite regression checks."""
import json
import subprocess
from evidence_bundle import evidence_context, write_entries_archive

root, logs, read = evidence_context(__file__, 'route-output')
assert 'SyntaxError' in read('node-before')
assert '[lifecycle]' in read('node-before')
assert 'pass 2' in read('node-final') and 'fail 0' in read('node-final')
assert not read('lint-final').strip()
names = [
    'js/tests/route-loading.test.js',
    'experiments/issue-56/route-output-before.py',
    'experiments/issue-56/collect-route-output.py',
    'experiments/issue-56/parent_replay.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-route-observer-output.md',
    'ci-logs/ci-b868-windows-node-133541760585.log',
    *[str(path.relative_to(root)) for path in logs.glob('route-output-*.log')],
]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/tests/route-loading.test.js'] = subprocess.check_output([
    'git', 'show', 'b868a82b:js/tests/route-loading.test.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': 'b868a82b4a2c26f1f285965037aedd43467babd9',
    'run': 43935461844, 'job': 133541760585,
    'focusedPass': 2, 'criterionAccepted': False, 'originalUnchecked': 60,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-route-observer-output.tar.gz', entries)
