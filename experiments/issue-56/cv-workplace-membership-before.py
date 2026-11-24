"""Reproduce the missing separate deselection review on the published parent."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-workplace-membership', '3483c8b1', [
    ('service', 'js/src/jobs/cv-workplace-review-service.js', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=membership-only review binds', 'js/tests/cv-workplace-membership.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-workplace-membership-browser.mjs', '--before']),
])
