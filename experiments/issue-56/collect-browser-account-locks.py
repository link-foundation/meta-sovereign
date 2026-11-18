"""Preserve the finite Bun account fixture failure without unrelated drafts."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'browser-ownership')
assert 'STORE_COORDINATION_UNAVAILABLE' in read('bun-scope-parent')
assert '1 fail' in read('bun-scope-parent')
assert '1 pass' in read('bun-scope-final') and '0 fail' in read('bun-scope-final')
assert 'pass 1' in read('node-scope-final') and 'fail 0' in read('node-scope-final')
assert not read('account-lint').strip()
assert 'All matched files use Prettier code style!' in (logs / 'browser-account-locks-format.log').read_text()
assert not (logs / 'browser-account-locks-secrets.log').read_text().strip()
sources = [
    'js/tests/telegram-extra-accounts.test.js',
    'js/tests/helpers/snapshot-locks.mjs',
    'js/src/storage/browser-snapshot.js',
    'docs/case-studies/issue-56/ci-browser-account-locks.md',
    'experiments/issue-56/collect-browser-account-locks.py',
    'ci-logs/native-register-browser-parent-bun-linux.log',
    'ci-logs/browser-account-locks-parent-windows-bun.log',
    'ci-logs/resume-current-runs.json',
    'ci-logs/resume-8b1c-jobs.json',
    'ci-logs/resume-pr-checks.json',
    'ci-logs/browser-account-locks-format.log',
    'ci-logs/browser-account-locks-secrets.log',
    *[f'ci-logs/browser-ownership-{name}.log' for name in [
        'bun-scope-parent', 'bun-scope-final', 'node-scope-final', 'account-lint']],
]
for filename in sources[5:7]:
    text = (root / filename).read_text()
    assert 'STORE_COORDINATION_UNAVAILABLE' in text and '1 fail' in text
bundle(root, sources, 'docs/case-studies/issue-56/data/browser-account-locks.tar.gz',
       dict(parent='8b1c19bad88061055a4c8657f771c947bcdcdd46',
            parent_workflow=43481124739, parent_failures=1,
            affected_hosted_jobs=[132079487843, 132079488128],
            focused_bun_passes=1, focused_node_passes=1,
            production_changed=False, full_local_matrix=False,
            exact_head_ci_required=True, issue_complete=False),
       'no-browser-account-locks-images-*.png',
       before={'js/tests/telegram-extra-accounts.test.js': '8b1c19ba'})
