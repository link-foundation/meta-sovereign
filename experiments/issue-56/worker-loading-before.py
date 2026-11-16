"""Check real pending-import observability against the exact published parent."""
from parent_replay import replay_parent

replay_parent(__file__, 'worker-loading', '484a6b5141e4e58df0ab5070853c47d221c2cb4b', [
    ('bootstrap', 'js/bin/server-worker.js', [
        'node', '--max-old-space-size=192', '--test', '--test-concurrency=1',
        'js/tests/worker-loading.test.js']),
    ('client', 'js/src/server/worker-client.js', [
        'node', '--max-old-space-size=192', '--test', '--test-concurrency=1',
        '--test-name-pattern=worker import checkpoints', 'js/tests/worker-client.test.js']),
])
