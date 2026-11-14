"""Replay focused export regressions against the actual parent, then restore sources."""
from parent_replay import replay_parent

replay_parent(__file__, 'resume-export', '3a6a49fd', [
    ('service', 'js/src/jobs/service.js', [
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=durable export IDs', 'js/tests/job-resume-exports.test.js']),
    ('browser', 'js/src/web/app.min.js', [
        'node', 'experiments/issue-56/resume-export-browser.mjs', '--before']),
])
