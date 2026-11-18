"""Replay the missing comparison service and UI against the published parent."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-translation', '2389fc8e', [
    ('service', 'js/src/jobs/service.js', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=vacancy service exposes bounded private translation', 'js/tests/cv-translation.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-translation-browser.mjs', '--before']),
])
