"""Retain bounded diagnostics for the unresolved Windows startup delay."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'ci-release-progress')
assert 'pass 5' in read('focused') and 'fail 0' in read('focused')
assert 'snapshot copy diagnostics' in read('trace-before')
assert 'fail 1' in read('trace-before')
assert not read('lint').strip()
bundle(root, [
    'experiments/issue-56/collect-ci-release-progress.py',
    'experiments/issue-56/release-progress-before.py',
    'experiments/issue-56/parent_replay.py',
    'docs/case-studies/issue-56/ci-release-progress.md',
    'js/src/server/rolling-release.js',
    'js/tests/rolling-release-copy.test.js',
    'ci-logs/reply-ownership-parent-deno-windows3.log',
    'ci-logs/browser-tabs-hosted-run.json',
    *[f'ci-logs/ci-release-progress-{name}.log'
      for name in ['focused', 'trace-before', 'lint', 'format']],
], 'docs/case-studies/issue-56/data/ci-release-progress.tar.gz',
   dict(parent='80e93aa5e5bcd73b6e50ad244f92550c1eb5835d',
        hosted_job=132170643919, focused_tests=5,
        maximum_progress_messages=8, copy_concurrency=4,
        deadlines_increased=False, startup_correction_verified=False,
        issue_complete=False), 'no-release-progress-images-*',
   before={'js/src/server/rolling-release.js': '80e93aa5'})
