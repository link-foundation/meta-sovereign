"""Preserve the finite foreground ownership failure and hosted job evidence."""
from evidence_bundle import evidence_context, verify_evidence, evidence_logs, bundle, parent_reply_sources

root, logs, read = evidence_context(__file__, 'vk-cli-close')
verify_evidence(read, {
    'before': ['fail 4', 'VK outgoing queue stopped'],
    'before-node': ['fail 1', 'not to be reference-equal'],
    'node': ['pass 31', 'fail 0', 'cancelled 0'],
    'deno': ['31 passed | 0 failed'],
    'format-final': ['All matched files use Prettier code style!'],
})
sources = [
    'js/src/automation/vk-outgoing-queue.js',
    'js/tests/vk-queue-lifecycle.test.js', 'js/tests/automation-cli.test.js',
    'experiments/issue-56/vk-queue-lifecycle-before.py',
    'experiments/issue-56/collect-vk-queue-lifecycle.py',
    'docs/case-studies/issue-56/ci-vk-queue-lifecycle.md',
]
parent = 'aee0a2ec0c2445a0a39c61ac6c4c6cf91f5129f3'
bundle(root, sources + evidence_logs(root, 'vk-cli-close')
       + evidence_logs(root, 'checks-aee')
       + ['ci-logs/vk-cli-close-hosted-jobs.json'],
       'docs/case-studies/issue-56/data/vk-queue-lifecycle.tar.gz', {
           'parent': parent, 'node_passed': 31, 'deno_passed': 31,
           'hosted_run': 43737908926, 'failed_job_logs': 8,
           'live_provider_effects': 0, 'issue_complete': False,
       }, 'no-screenshots-for-internal-ownership',
       before=parent_reply_sources(root, sources, parent))
