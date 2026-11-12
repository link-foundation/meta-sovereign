"""Bounded regression replay against the actual published parent; always restore."""
from parent_replay import replay_parent

replay_parent(__file__, 'cv-technology', '8c4bfc6c', [
    ('service', 'js/src/jobs/technology-service.js', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=bilingual verified exports', 'js/tests/cv-technology-review.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-technology-browser.mjs', '--before']),
])
