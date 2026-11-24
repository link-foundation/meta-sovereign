"""Reproduce the actual hosted fixture's wall-clock scheduling dependency."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-watch-fixture-clock', '623a144c', [
    ('clock', 'experiments/issue-56/cv-watch-fixture.mjs', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        'js/tests/cv-watch-fixture-clock.test.js']),
])
