"""Require finite parent failures and preserved durable-trigger checks."""
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    bundle, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'vk-trigger')
verify_evidence(read, {
    'before-node': ['fail 1', '4 !== 1'],
    'shutdown-before': ['fail 1', 'true !== false'],
    'node': ['pass 26', 'fail 0', 'cancelled 0'],
    'deno': ['26 passed | 0 failed'],
    'format-final': ['All matched files use Prettier code style!'],
})
parent = '2798951cb62454a0e9e400a75649fa492d7911d7'
sources = changed_sources(root)
references = evidence_logs(root, 'vk-runner-reference', ('.js', '.json'))
bundle(root, sources + evidence_logs(root, 'vk-trigger') + references,
       'docs/case-studies/issue-56/data/vk-trigger.tar.gz', {
           'parent': parent, 'node_passed': 26, 'deno_passed': 26,
           'parent_duplicate_runs': 4, 'corrected_duplicate_runs': 1,
           'server_flush_waits_for_admitted_work': True,
           'live_provider_effects': 0, 'hosted_verification_pending': True,
           'VK26_complete': False, 'issue_complete': False,
       }, 'issue-56-vk-trigger/*.png',
       before=parent_reply_sources(root, sources, parent))
