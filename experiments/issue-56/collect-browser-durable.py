"""Preserve actual-parent browser persistence failures and focused verification."""
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'browser-durable')
assert 'Expected two actual-parent browser durability failures' in read('before')
assert 'pass 10' in read('node-final') and 'fail 0' in read('node-final')
assert '4 passed | 0 failed' in read('deno')
assert '[e2e-lino-sync] OK (webkit)' in read('native-final')
assert '"connectedReload":true' in read('native-final')
assert not read('lint-final').strip()
bundle(root, [
    'js/src/storage/browser-store.js', 'js/src/storage/browser-snapshot-queue.js',
    'js/tests/browser-store.test.js', 'js/tests/browser-store-durability.test.js',
    'experiments/issue-56/browser-durability-before.py',
    'experiments/issue-56/collect-browser-durable.py',
    'ci-logs/ea957225-lint-131368719426.log',
    *evidence_logs(root, 'browser-durable'),
], 'docs/case-studies/issue-56/data/browser-durable-snapshots.tar.gz',
    dict(parent='789f317d', parent_failures=2, node_checks=10,
         deno_durability_checks=4, native_webkit=True,
         same_turn_batching=True, committed_reads=True,
         failure_rolls_back=True, full_local_suite=False,
         offline_reconciliation_complete=False, exact_head_ci_required=True),
    'issue-56-browser-durable/**/*.png',
    before={'js/src/storage/browser-store.js': '789f317d'})
