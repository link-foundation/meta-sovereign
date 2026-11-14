"""Replay focused regressions against the published parent, restoring all bytes."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-prepare', '9d805e4f', [
    ('service', 'js/src/jobs/service.js', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=native About preparation resolves', 'js/tests/cv-prepare.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-prepare-browser.mjs', '--before']),
])
