"""Retain a negative finite probe without labeling it a hosted root cause."""
import json
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
result = json.loads((root / 'ci-logs/vacancy-input-order-before.log').read_text())
assert result == {
    'query': 'Python', 'excludeText': 'final paragraph',
    'decisions': ['needs-description', 'responded'],
}
names = [
    'experiments/issue-56/vacancy-input-order.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/collect-vacancy-input-order.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/vacancy-input-order.md',
    'ci-logs/vacancy-input-order-before.log',
    'ci-logs/vacancy-input-order-lint.log',
    'ci-logs/vacancy-input-order-format.log',
]
entries = {name: (root / name).read_bytes() for name in names}
entries['metadata.json'] = (json.dumps({
    'result': result, 'hypothesis_reproduced': False,
    'hosted_cause': 'unproven', 'production_changed': False,
    'issue_complete': False, 'acceptance_rows_completed': [],
}, indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/vacancy-input-order.tar.gz', entries)
