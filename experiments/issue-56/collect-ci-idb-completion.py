"""Preserve a hosted fixture race and bounded exact-parent reproduction."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'ci-idb-completion')
assert 'a completed transaction must contain its nested write' in read('parent')
assert 'fail 1' in read('parent') and 'pass 6' in read('focused')
assert 'fail 0' in read('focused') and not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('prettier')
bundle(root, [
    'experiments/issue-56/collect-ci-idb-completion.py',
    'experiments/issue-56/idb-completion-before.mjs',
    'docs/case-studies/issue-56/ci-idb-completion.md',
    'js/tests/browser-store.test.js',
    'ci-logs/reply-ownership-parent-node-windows.log',
    'ci-logs/browser-tabs-hosted-run.json',
    *[f'ci-logs/ci-idb-completion-{name}.log'
      for name in ['parent', 'focused', 'lint', 'prettier']],
], 'docs/case-studies/issue-56/data/ci-idb-completion.tar.gz',
   dict(parent='80e93aa5e5bcd73b6e50ad244f92550c1eb5835d',
        hosted_job=132170643616, focused_tests=6,
        delayed_requests_ms=10, production_change=False,
        deadlines_increased=False, exact_head_ci_required=True,
        issue_complete=False), 'no-idb-completion-images-*',
   before={'js/tests/browser-store.test.js': '80e93aa5'})
