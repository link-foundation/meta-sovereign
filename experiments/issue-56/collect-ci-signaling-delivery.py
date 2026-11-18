"""Retain bounded native-message timing evidence without claiming hosted latency."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-signaling-delivery')
assert 'assert.ok(seen.some' in read('before') and '1 failed' in read('before')
assert '1 passed | 0 failed' in read('delayed-final')
assert 'pass 9' in read('focused-final') and 'fail 0' in read('focused-final')
assert '9 passed | 0 failed' in read('deno-final')
assert 'All matched files use Prettier code style!' in read('format-final')
assert all(not read(name).strip() for name in ('lint-final', 'secrets-final', 'diff-final'))
assert 'ERROR:' not in read('duplication-final')
sources = changed_sources(root) + evidence_logs(root, 'ci-signaling-delivery')
sources += ['ci-logs/checks-43600700798-ubuntu-deno.log',
            'ci-logs/hh-discovery-parent-deno-job.json']
parent = 'ef99739ba4f2684d7714c456f794caa004dbe41c'
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-signaling-delivery.tar.gz', {
    'published_parent': parent, 'hosted_failure_head': 'c976dc98',
    'hosted_run': 43600700798, 'hosted_job': 132465586330,
    'hosted_delivery_latency_measured': False, 'probe_message_delay_ms': 120,
    'parent_cleanup_harness': True, 'parent_failures': 1,
    'node_pass': 9, 'deno_pass': 9, 'delayed_probe_pass': 1,
    'original_inventory_unchecked': 81, 'issue_complete': False,
    'exact_head_ci_required': True,
}, 'ci-signaling-delivery-*.png', before={'js/tests/server-sync.test.js': parent})
