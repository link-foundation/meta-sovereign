"""Preserve the recurring Windows failure and finite method comparison."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '1798eaef'
read = lambda name: (root / f'ci-logs/release-copy-method-{name}.log').read_text()
rows = [json.loads(line.split('] ', 1)[1]) for line in read('linux').splitlines()
        if line.startswith('[release-copy-method] ')]
assert len(rows) == 2
assert {row['method'] for row in rows} == {'copyFile', 'buffered'}
assert all(row['copies'] == 1470 and row['maximum'] == 4 for row in rows)
assert rows[0]['bytes'] == rows[1]['bytes'] == 17550144
assert not read('lint') and not read('secrets')
assert 'All workflows enforce runner, deadline and checkout policy' in read('workflow')
assert 'fail 0' in read('node')
assert 'All matched files use Prettier code style!' in read('format-check')
bundle(root, [
    *changed_sources(root, parent), *evidence_logs(root, 'release-copy-method'),
    'ci-logs/inactive-focus-parent-windows-deno-130772387445.log',
    'ci-logs/inactive-focus-parent-checks.json',
], 'docs/case-studies/issue-56/data/ci-release-copy-methods.tar.gz', {
    'parent': parent, 'hosted_parent': 'b73f3433dc050922b0747d0fe4f8f52eba1f8e26',
    'local_checks_only': True, 'production_strategy_unchanged': True,
    'file_budget': 4096, 'byte_budget': 134217728, 'buffer_budget': 8388608,
    'remaining': 'Hosted Windows observations, startup correction and all unchecked product criteria.',
}, 'issue-56-ci-release-copy-methods/*.png', before={
    '.github/workflows/release.yml': parent,
})
