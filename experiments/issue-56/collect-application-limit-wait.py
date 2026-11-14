"""Retain confirmed waiting, parent failures and unresolved hosted evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-limit-wait')
checks = {
    'focused-final': ('pass 54', 'fail 0'),
    'deno-final': ('49 passed | 0 failed',),
    'before': ('Confirmed daily-limit waiting is missing.',),
    'before-native': ('Confirmed daily-limit waiting is missing.',),
    'native-group': ('"refusedNativeChanges":3', '"guardedRefreshes":1', '"sends":0', 'OK (chromium)'),
    'native-screenshot-final': ('"restorationSeparatelyConfirmed":true', '"errors":[]', 'OK (chromium)'),
    'mcp-server-final': ('"closed":true', '"liveProvider":false', '"pageErrors":[]'),
    'format-check-final': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication-final')
result = (logs / 'application-limit-wait-mcp-result.json').read_text()
assert all(value in result for value in ('"resourcesClosed":true', '"sends":0', '"guardedRefreshes":1', '"errors":[]'))
parent = 'cac7f7d3fc27370d00407d22ba835e67bc958167'
sources = changed_sources(root) + evidence_logs(root, 'application-limit-wait')
sources += ['experiments/issue-56/application_parent_fixture.py',
            'ci-logs/checks-43591479049.log',
            'ci-logs/checks-43591479049-webkit-4.log',
            'ci-logs/checks-43591479049-pipeline.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/application-limit-wait.tar.gz', {
    'published_parent': parent, 'native_schema': 19,
    'node_final_group': 54, 'deno_final_group': 49,
    'native_chromium_group': 2, 'independent_mcp': 1,
    'entry_clicks': 1, 'sends': 0, 'guarded_expiry_refreshes': 1,
    'automatic_restoration': False, 'authenticated_provider': False,
    'original_inventory_unchecked': 81, 'issue_complete': False,
    'unresolved_parent_ci': {'run': 43591479049, 'job': 132437782294},
    'exact_head_ci_required': True,
}, 'application-limit-wait-*.png', before={
    name: parent for name in ('js/src/jobs/application-service.js',
                            'js/src/jobs/application-page.js',
                            'js/src/jobs/application-limit-backups.js')
})
