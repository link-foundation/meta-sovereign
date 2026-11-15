"""Preserve CodeQL's finding and deterministic parent/current checks."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'ci-vk-message-random')
assert 'fail 1' in read('before') and '2147483647' in read('before')
assert 'pass 3' in read('node') and 'fail 0' in read('node')
assert '3 passed | 0 failed' in read('deno')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('format')
finding = (logs / 'vk-cancelled-codeql.log').read_text()
assert 'js/biased-cryptographic-random at js/src/automation/vk-cancelled-planner.js:106' in finding
sources = [
    'js/src/automation/vk-message-random.js',
    'js/src/automation/vk-cancelled-planner.js',
    'js/tests/vk-message-random.test.js',
    'experiments/issue-56/ci-vk-message-random-before.py',
    'experiments/issue-56/collect-ci-vk-message-random.py',
    'docs/case-studies/issue-56/ci-vk-message-random.md',
]
receipts = [f'ci-logs/ci-vk-message-random-{name}.log'
            for name in ['before', 'node', 'deno', 'lint', 'format']]
receipts += ['ci-logs/vk-cancelled-codeql.log', 'ci-logs/vk-cancelled-security.log']
bundle(root, sources + receipts,
       'docs/case-studies/issue-56/data/ci-vk-message-random.tar.gz',
       dict(parent='07d3159e73bc8ee4620904260905b1b3ca251c20', node_pass=3,
            deno_pass=3, maximum_zero_draws=8, issue_complete=False,
            hosted_verification_pending=True), 'no-random-identity-screenshots',
       before={'js/src/automation/vk-cancelled-planner.js': '07d3159e'})
