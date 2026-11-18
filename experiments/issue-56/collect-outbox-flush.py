"""Preserve the finite durable-reservation regression and focused verification."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 2' in (root / 'ci-logs/outbox-flush-node.log').read_text()
assert 'fail 2' in (root / 'ci-logs/outbox-flush-parent-node.log').read_text()
bundle(root, [
    'js/src/automation/outbox.js', 'js/tests/question-outbox-flush.test.js',
    'js/tests/send-safety.test.js',
    'experiments/issue-56/outbox-flush-before.py',
    'experiments/issue-56/collect-outbox-flush.py',
    'docs/case-studies/issue-56/outbox-flush.md',
    'ci-logs/outbox-flush-parent-node.log', 'ci-logs/outbox-flush-parent.log',
    'ci-logs/outbox-flush-node.log', 'ci-logs/outbox-flush-safety.log',
], 'docs/case-studies/issue-56/data/outbox-flush.tar.gz', {
    'parent': 'ea8d7eae978375b953bf212d364aa645deaae69a',
    'regression': 'provider dispatch preceded the grouped text-store flush',
    'remaining': 'Current-chat watcher and every unchecked issue criterion.',
}, 'issue-56-no-screenshots/*.png', before={
    'js/src/automation/outbox.js': 'ea8d7eae',
})
