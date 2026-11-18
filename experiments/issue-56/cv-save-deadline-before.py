"""Replay finite deadline refusals against the actual published verification cycle."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-save-deadline', '08cf9ee5', [
    ('cycle', 'js/src/jobs/cv-save-cycle.js', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        'js/tests/cv-save-deadline.test.js']),
])
