"""Retain the finite actual-parent cancellation regression and compatibility."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert "actual: [ 'SIGTERM' ]" in (logs / 'runner-transport-deadline-before.log').read_text()
assert '"forcedAfterGrace":true' in (logs / 'runner-transport-deadline-after.log').read_text()
assert 'pass 24' in (logs / 'runner-transport-focused.log').read_text()
assert 'fail 0' in (logs / 'runner-transport-focused.log').read_text()
assert '8 passed | 0 failed' in (logs / 'runner-transport-deno.log').read_text()
assert not (logs / 'runner-transport-lint.log').read_text().strip()
names = [
    'js/src/server/runner-transport.js',
    'js/tests/runner-transport.test.js',
    'js/tests/runner-transport-lifecycle.test.js',
    'experiments/issue-56/runner-transport-child.mjs',
    'experiments/issue-56/runner-transport-fixture.mjs',
    'experiments/issue-56/runner-transport-deadline.mjs',
    'experiments/issue-56/collect-runner-transport-deadline.py',
    'docs/case-studies/issue-56/runner-transport-deadline.md',
    'PLAN.md',
]
names += [str(p.relative_to(root)) for p in logs.glob('runner-transport-*.log')]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/src/server/runner-transport.js'] = subprocess.check_output(
    ['git', 'show', 'b558bd74:js/src/server/runner-transport.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': 'b558bd7424cd03b8e2a50e07ce123635a62b72f1',
    'focused_node_tests': 24, 'focused_deno_tests': 8,
    'native_stubborn_child_has_finite_fallback': True,
    'deadline_ms': 10000, 'termination_grace_ms': 1000,
    'full_issue_complete': False, 'inventory_accepted': False,
    'hosted_verification': 'required',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-transport-deadline.tar.gz', entries)
