"""Reproduce the relocated recovery worker's unresolved dynamic import."""
from parent_replay import replay_parent

replay_parent(__file__, 'recovery-import', '36d41ffb916fdaa17b4cb75c36730e4c694e354b', [
    ('node', 'js/tests/rolling-host.test.js', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=an upgrade can replace a build',
        'js/tests/rolling-host.test.js']),
])
