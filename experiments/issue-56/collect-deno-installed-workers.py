"""Preserve the offline worker regression and exact Windows startup evidence."""
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'deno-worker-dependencies')
assert 'Expected actual-parent installed-dependency failure' in read('before')
assert '5 passed | 0 failed' in read('deno')
assert '1 passed | 0 failed' in read('cli')
assert '[rolling-cli] initial host ready' in read('cli')
assert 'Download' not in read('cli')
bundle(root, [
    'js/src/server/worker-client.js', 'js/tests/worker-client.test.js',
    'experiments/issue-56/deno-worker-dependencies-before.py',
    'experiments/issue-56/collect-deno-installed-workers.py',
    'ci-logs/d4c7fb81-job-131362601592.log',
    *evidence_logs(root, 'deno-worker-dependencies'),
], 'docs/case-studies/issue-56/data/ci-deno-installed-workers.tar.gz',
    dict(published_parent='7ac3ac65', hosted_parent='d4c7fb81',
         run=43269083327, job=131362601592, offline_parent_regression=True,
         deno_focused_checks=5, real_deno_cli_scenarios=1,
         deadlines_unchanged=True, windows_head_confirmation_required=True,
         full_local_suite=False), 'issue-56-deno-workers/**/*.png',
    before={'js/src/server/worker-client.js': '7ac3ac65'})
