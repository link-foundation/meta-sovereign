"""Replay finite actual-parent workplace regressions with unconditional restoration."""
from parent_replay import replay_parent
command = ['node', '--test', '--test-concurrency=1',
           '--test-name-pattern=a selected workplace description',
           'js/tests/cv-workplace-prepare.test.js']
replay_parent(__file__, 'cv-workplace-prepare', 'ee7a74e4', [
    ('options', 'js/src/jobs/cv-prepare-record.js', command),
    ('source', 'js/src/jobs/cv-prepare-source.js', command),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-workplace-prepare-browser.mjs', '--before']),
])
