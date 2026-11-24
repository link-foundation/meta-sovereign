"""Replay the recovery regression against its actual published parent."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-prepare-cancel', '6e5f3ca7', [
    ('service', 'js/src/jobs/cv-prepare-service.js', ['node', '--test', '--test-concurrency=1', '--test-timeout=15000', '--test-name-pattern=cancelling an unreceived preparation', 'js/tests/cv-prepare-cancel.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-prepare-cancel-browser.mjs', '--before']),
])
