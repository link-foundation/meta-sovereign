"""Require first-event ordering, failure recovery and durable metadata evidence."""
from evidence_bundle import evidence_context, verify_evidence, changed_sources, evidence_logs, bundle, parent_reply_sources

root, logs, read = evidence_context(__file__, 'vk-history')
verify_evidence(read, {
    'node': ['pass 79', 'fail 0', 'cancelled 0'],
    'deno': ['79 passed | 0 failed'],
    'format-final': ['All matched files use Prettier code style!'],
})
before = (logs / 'vk-live-history-before-node.log').read_text()
assert 'fail 1' in before and 'actual: [ 1 ]' in before and 'expected: [ 100 ]' in before
sources = changed_sources(root)
parent = 'aee0a2ec0c2445a0a39c61ac6c4c6cf91f5129f3'
bundle(root, sources + evidence_logs(root, 'vk-history')
       + evidence_logs(root, 'vk-live-history')
       + evidence_logs(root, 'vk-runner', ('.js', '.json')),
       'docs/case-studies/issue-56/data/vk-live-history.tar.gz', {
           'parent': parent, 'node_passed': 79, 'deno_passed': 79,
           'native_history_window': 100, 'recent_peer_limit': 256,
           'live_provider_effects': 0, 'hosted_verification_pending': True,
           'issue_complete': False,
       }, 'no-screenshots-for-internal-history-ordering',
       before=parent_reply_sources(root, sources, parent))
