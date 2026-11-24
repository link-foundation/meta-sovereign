"""Replay new-identity acceptance against the actual published watcher, retaining controls."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-created-workplace', 'a50bf56d', [
    ('cycle', 'js/src/jobs/cv-save-cycle.js', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        'js/tests/cv-created-workplace.test.js']),
    ('native', 'js/src/jobs/cv-watch-runtime.js', [
        'node', '--max-old-space-size=384',
        'experiments/issue-56/cv-created-workplace-native.mjs', '--before', '--screenshots']),
])
