"""Preserve actual CI navigation/partition failures and focused corrections."""
import json
from pathlib import Path
import re
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '99928003139435f26145f42b8f3d088a7d90c0d0'
read = lambda name: (root / f'ci-logs/ci-browser-shards-{name}.log').read_text()
assert 'Execution context was destroyed' in read('disclosure-before')
assert 'Actual parent executes checks assigned to other shards' in read('runner-before')
assert "actual: [ 'first', 'second', 'third', 'fourth' ]" in read('runner-before')
assert 'pass 21' in read('node') and 'fail 0' in read('node')
for name, engine in [('after', 'webkit'), ('chromium', 'chromium')]:
    value = read(f'disclosure-{name}')
    assert '[question-preview-reuse] {"cases":3}' in value
    assert f'[e2e-question-disclosure] OK ({engine})' in value
assert 'All workflows enforce runner, deadline and checkout policy' in read('workflow')
assert all(not read(name) for name in ('lint', 'syntax', 'secrets'))
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
columns = [column.strip() for column in total.split('│') if column.strip()]
assert 'ERROR' not in duplication
assert int(columns[5].split()[0]) / int(columns[2]) * 100 <= 6.5
bundle(root, [
    *changed_sources(root, parent),
    *(name for name in evidence_logs(root, 'ci-browser-shards')
      if not name.endswith('ui-checks-43083805944.log')),
    'ci-logs/question-background-parent-webkit-130725304728.log',
    'ci-logs/inactive-history-macos-node-130752686210.log',
    'ci-logs/inactive-history-head-checks.json',
], 'docs/case-studies/issue-56/data/ci-browser-shards.tar.gz', {
    'parent': parent, 'actual_parent_failures': 2, 'node_checks': 21,
    'webkit_disclosure_checks': 3, 'chromium_disclosure_checks': 3,
    'shards_per_engine': 4, 'subprocess_ms': 180000, 'job_minutes': 35,
    'remaining': 'Separate macOS Node stall, exact-head CI, background/unread orchestration, live providers and every unchecked issue criterion.',
}, 'issue-56-ci-browser-shards/*.png', before={
    name: parent for name in (
        'js/scripts/run-browser-checks.mjs', '.github/workflows/release.yml',
        'js/tests/helpers/e2e-question-disclosures.mjs')
})
