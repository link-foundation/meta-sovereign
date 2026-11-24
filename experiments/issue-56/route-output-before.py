"""Replay the exact hosted failure with lifecycle tracing explicitly enabled."""
import os
from parent_replay import replay_parent

os.environ['MS_LIFECYCLE_DEBUG'] = '1'
replay_parent(__file__, 'route-output', 'b868a82b4a2c26f1f285965037aedd43467babd9', [
    ('node', 'js/tests/route-loading.test.js', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=idle startup and rejected requests',
        'js/tests/route-loading.test.js']),
])
