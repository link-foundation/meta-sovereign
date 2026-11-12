"""Preserve finite TCP cleanup and the merged native mesh validation."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'rtc-lifecycle-merged')
assert 'pass 14' in read('node') and 'fail 0' in read('node')
assert 'pass 8' in read('transport') and 'fail 0' in read('transport')
assert '[e2e-lino-sync] OK (webkit)' in read('native')
assert '"connectedReload":true' in read('native')
assert '"remainingPair":true' in read('native')
bundle(root, [
    'js/src/sync/ws-transport.js', 'js/tests/sync-ws.test.js',
    'js/src/sync/signaling-room.js', 'js/src/sync/webrtc-mesh.js',
    'js/src/sync/webrtc-transport.js', 'js/src/web/webrtc-sync.js',
    'js/tests/helpers/e2e-lino-sync-mesh.mjs',
    'experiments/issue-56/collect-websocket-disconnect.py',
    *[f'ci-logs/rtc-lifecycle-merged-{name}.log'
      for name in ('node', 'transport', 'native')],
], 'docs/case-studies/issue-56/data/websocket-disconnect.tar.gz',
    dict(merged_parent='e3c1e27b', node_checks=22, native_webkit=True,
         alternative_archive_preserved=True, full_local_suite=False,
         offline_reconciliation_verified=False, exact_head_ci_required=True),
    'issue-56-websocket-disconnect/**/*.png',
    before={'js/src/sync/ws-transport.js': 'd4c7fb81'})
