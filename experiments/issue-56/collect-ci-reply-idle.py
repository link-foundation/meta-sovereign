"""Preserve exact hosted idle-fixture failures and the native Bun reproduction."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'ci-reply-idle')
before = read('bun-file-before')
assert '12 pass' in before and '1 fail' in before
assert 'the finite cache operation did not finish' in before
assert '13 pass' in read('bun-focused') and '0 fail' in read('bun-focused')
assert 'pass 1' in read('node-focused') and 'fail 0' in read('node-focused')
assert not read('lint').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('prettier')
failed = ['deno-linux', 'deno-macos', 'deno-windows2',
          'bun-linux', 'bun-macos', 'bun-windows']
for name in failed:
    assert 'the finite cache operation did not finish' in (
        logs / f'head64-{name}.log').read_text()
bundle(root, [
    'experiments/issue-56/collect-ci-reply-idle.py',
    'docs/case-studies/issue-56/ci-reply-idle.md',
    'js/tests/reply-cache-ownership.test.js',
    'js/src/replies/reply-cache-work.js',
    'ci-logs/reply-idle-parent-jobs.json',
    *[f'ci-logs/head64-{name}.log' for name in failed],
    *[f'ci-logs/head64-{name}.log' for name in
      ['deno-windows3', 'node-windows', 'webkit4']],
    *[f'ci-logs/ci-reply-idle-{name}.log' for name in
      ['bun-file-before', 'bun-before', 'deno-before', 'bun-focused',
       'node-focused', 'lint', 'prettier', 'diff']],
], 'docs/case-studies/issue-56/data/ci-reply-idle.tar.gz',
   dict(parent='bf633bb2edf2365d4f32d2f1ec6c0addcfcb8fb5',
        hosted_head='64a9b6e2dc0bf32cbba03b21922fae3d1567e39b',
        hosted_run=43513510889, failed_jobs=6, focused_bun_tests=13,
        focused_node_tests=1, production_change=False,
        deadlines_increased=False, exact_head_ci_required=True,
        issue_complete=False), 'no-reply-idle-images-*',
   before={'js/tests/reply-cache-ownership.test.js': 'bf633bb2'})
