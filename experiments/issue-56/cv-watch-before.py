"""Replay focused regressions against the published parent, restoring all bytes."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-watch', '15f9c3e8', [
    ('service', 'js/src/jobs/service.js', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=trusted final Save', 'js/tests/cv-save-watch.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-watch-browser.mjs', '--before']),
])
