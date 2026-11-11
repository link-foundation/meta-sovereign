"""Preserve the hosted capability-contract regression and focused correction."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 36' in (root / 'ci-logs/hh-capability-contract-node.log').read_text()
logs = sorted((root / 'ci-logs').glob('shared-choice-runtime-*.log'))
logs.append(root / 'ci-logs/shared-choice-node-130410483875.log')
assert len(logs) == 9
assert all('hh composer/send' in path.read_text(encoding='utf-8-sig') for path in logs)
bundle(root, [
    'js/tests/message-actions.test.js', 'js/tests/hh-web-ui.test.js',
    'js/src/sources/hh-web-ui.js',
    'docs/case-studies/issue-56/hh-capability-contract.md',
    'experiments/issue-56/collect-hh-capability.py',
    'ci-logs/hh-capability-contract-node.log',
    'ci-logs/choice-workflow-ci-runs.json',
    'ci-logs/choice-workflow-checks-jobs.json',
    *[str(path.relative_to(root)) for path in logs],
], 'docs/case-studies/issue-56/data/hh-capability-contract.tar.gz', {
    'parent': '3538f08a1729f1d7eb0f6bc3fa9fa7e3a53ef8d3',
    'hosted_run': 42986547260, 'runtime_failures': 9,
    'root_cause': 'An older test assumes full messaging from every adapter.',
    'focused_node_pass': 36,
    'remaining': 'Hosted verification and every unchecked issue criterion.',
}, 'issue-56-no-screenshots/*.png', before={
    'js/tests/message-actions.test.js': '3538f08a',
})
