"""Run finite regressions against the published parent and restore both files."""
from parent_replay import replay_parent

replay_parent(__file__, 'technology', '72ec50bf', [
    ('service', 'js/src/jobs/service.js', ['node', '--test', '--test-concurrency=1',
     '--test-name-pattern=verified explicit resume technology', 'js/tests/job-technology-analysis.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/technology-browser.mjs', '--before']),
    ('ci-budgets', 'js/scripts/browser-checks.json', ['node', '--test', '--test-concurrency=1',
     '--test-name-pattern=independent mandatory browser budgets', 'js/tests/ci-contracts.test.js']),
])
