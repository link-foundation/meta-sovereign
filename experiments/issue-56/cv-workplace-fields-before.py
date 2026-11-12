"""Replay finite actual-parent field review failures with unconditional restoration."""
from parent_replay import replay_parent
command = ['node', '--test', '--test-concurrency=1',
           '--test-name-pattern=full workplace plan binds',
           'js/tests/cv-workplace-fields.test.js']
replay_parent(__file__, 'cv-workplace-fields', '2389fc8e', [
    ('service', 'js/src/jobs/technology-service.js', command),
    ('options', 'js/src/jobs/cv-prepare-record.js', command),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-workplace-fields-browser.mjs', '--before']),
])
