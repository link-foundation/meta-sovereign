"""Retain actual-parent draft failures, focused checks and daily-pause evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-limit-drafts')
checks = {
    'focused-final': ('pass 74', 'fail 0'),
    'deno-final': ('41 passed | 0 failed',),
    'before': ('The visible daily-limit form needs an automatic recovery draft.',),
    'before-native': ('Daily-limit recovery draft is missing.',),
    'native-final': ('"automaticBackup":true', '"sends":0', '"errors":[]', 'OK (chromium)'),
    'mcp-server': ('"closed":true', '"liveProvider":false', '"pageErrors":[]'),
    'format-check-final': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'rust-format', 'diff-final'):
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication-final')
result = (logs / 'application-limit-drafts-mcp-result.json').read_text()
assert all(value in result for value in ('"automaticBackup":true', '"resourcesClosed":true', '"sends":0', '"errors":[]'))
parent = '74463a7697e4d0553f7ef17418d3ec50b51933bd'
sources = changed_sources(root) + evidence_logs(root, 'application-limit-drafts')
sources += ['experiments/issue-56/application_parent_fixture.py',
            'ci-logs/application-limits-contracts-132430848151.log',
            'ci-logs/application-limits-lint-132430848248.log',
            'ci-logs/application-limits-pipeline-132432863885.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/application-limit-drafts.tar.gz', {
    'published_parent': parent, 'native_schema': 19,
    'node_final_group': 74, 'deno_final_group': 41,
    'native_chromium': 1, 'independent_mcp': 1,
    'entry_clicks': 1, 'sends': 0, 'automatic_backup': True,
    'automatic_expiry_refresh': False, 'authenticated_provider': False,
    'original_inventory_unchecked': 81, 'issue_complete': False,
    'exact_head_ci_required': True, 'rust_compilation': 'hosted CI required',
}, 'application-limit-drafts-*.png', before={
    name: parent for name in ('js/src/jobs/application-service.js',
                            'js/src/jobs/application-review.js',
                            'js/src/jobs/application-drafts.js')
})
