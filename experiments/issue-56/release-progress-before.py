"""Check the exact published release cannot expose copy progress."""
from parent_replay import replay_parent

replay_parent(__file__, 'ci-release-progress', '80e93aa5', [
    ('trace', 'js/src/server/rolling-release.js', [
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=snapshot copy diagnostics',
        'js/tests/rolling-release-copy.test.js']),
])
