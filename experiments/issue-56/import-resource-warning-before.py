"""Replay published import assertions with synthetic counters, never stress."""
from parent_replay import replay_parent

replay_parent(__file__, 'import-resource-warning', '08cf9ee5', [
    ('assertions', 'js/tests/worker-import-resources.test.js', [
        'node', '--max-old-space-size=384', '--import',
        './experiments/issue-56/synthetic-import-resources.mjs',
        '--test', '--test-concurrency=1', 'js/tests/worker-import-resources.test.js']),
])
