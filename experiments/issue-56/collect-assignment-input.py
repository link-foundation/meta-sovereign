"""Freeze successful-command stdin regression and exact hosted failure logs."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 7' in (root / 'ci-logs/assignment-input-node.log').read_text()
assert '7 passed | 0 failed' in (root / 'ci-logs/assignment-input-deno.log').read_text()
assert 'actual parent refuses' in (root / 'ci-logs/assignment-input-parent.log').read_text()
sources = [
    'js/src/assignments/commands.js', 'js/tests/assignment-command-input.test.js',
    'js/tests/assignment-template-history.test.js',
    'experiments/issue-56/assignment-input-before.py',
    'experiments/issue-56/collect-assignment-input.py',
    'docs/case-studies/issue-56/ci-assignment-stdin.md',
    'ci-logs/summary-choice-job-130438063887.log',
    'ci-logs/summary-choice-checks-progress.json',
]
sources += [str(p.relative_to(root)) for p in (root / 'ci-logs').glob('assignment-input-*') if p.suffix in ['.log', '.json']]
bundle(root, sources, 'docs/case-studies/issue-56/data/assignment-input.tar.gz', {
    'parent': 'f7136b1e572665ff48c525faf3a9aed9fe51245a',
    'focused_node_pass': 7, 'focused_deno_pass': 7,
    'regression': 'zero-exit command falsely refused on an unused closed stdin pipe',
    'ci_failure_run': 42995004956, 'ci_failure_job': 130438063887,
    'remaining': 'Hosted verification and every unchecked issue criterion.',
}, 'issue-56-no-screenshots/*.png', before={
    'js/src/assignments/commands.js': 'f7136b1e',
})
