"""Replay pending-import resource observability against the published source."""
from parent_replay import replay_parent

replay_parent(__file__, 'worker-import-resources', 'f34c800a53b6a2c7337677dc81c477642f88bfa7', [
    ('bootstrap', 'js/bin/server-worker.js', [
        'node', '--max-old-space-size=192', '--test', '--test-concurrency=1',
        'js/tests/worker-loading.test.js']),
    ('client', 'js/src/server/worker-client.js', [
        'node', '--max-old-space-size=192', '--test', '--test-concurrency=1',
        '--test-name-pattern=worker import checkpoints', 'js/tests/worker-client.test.js']),
])
