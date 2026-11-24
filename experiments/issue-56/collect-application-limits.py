"""Retain finite daily-limit regressions, native evidence and source snapshots."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-limits')
required = {
    'focused-final': ['pass 45', 'fail 0'],
    'deno-final': ['18 passed | 0 failed'],
    'before': ['actual: undefined'],
    'before-native': ['Durable daily application pause is missing.'],
    'native-final': ['"originalDeadlineRetained":true', '"ownerValuesPreserved":true',
                     '"entries":1', '"sends":0', '"locales":4', '"errors":[]', 'OK (chromium)'],
    'language-native-final': ['"ownerEditsPreserved":true', '"sends":0', 'OK (chromium)'],
    'mcp-server': ['"closed":true', '"liveProvider":false', '"pageErrors":[]'],
    'format-check-final': ['All matched files use Prettier code style!'],
}
for label, expected in required.items():
    assert all(fragment in read(label) for fragment in expected), label
mcp = (logs / 'application-limits-mcp-result.json').read_text()
assert all(fragment in mcp for fragment in ['"ownerValuesPreserved":true',
    '"sends":0', '"entries":1', '"resourcesClosed":true', '"errors":[]'])
for gate in ['lint-final', 'secrets-final', 'diff-final', 'rust-format']:
    assert not read(gate).strip(), gate
assert 'ERROR:' not in read('duplication-final')
parent = '8ab11c52cb93950ea5ed5725bbfadac8a77f7384'
helpers = ['experiments/issue-56/application_parent_fixture.py',
           'experiments/issue-56/evidence_bundle.py', 'ci-logs/hh-reference-readme.md',
           'ci-logs/application-limit-reference.mjs']
bundle(root, [*changed_sources(root), *helpers, *evidence_logs(root, 'application-limits')],
       'docs/case-studies/issue-56/data/application-limits.tar.gz', {
           'published_parent': parent, 'native_schema': 18,
           'node_focused_group': 45, 'deno_focused': 18,
           'native_chromium': 2, 'independent_mcp': 1,
           'entry_clicks': 1, 'sends': 0, 'authenticated_provider': False,
           'pause_scope': 'workspace', 'pause_hours': 2,
           'automatic_backup_and_refresh': False,
           'original_inventory_unchecked': 81, 'issue_complete': False,
           'exact_head_ci_required': True, 'rust_compilation': 'hosted CI required',
       }, 'application-limits-*.png', before={
           name: parent for name in ['js/src/jobs/application-service.js',
           'js/src/jobs/application-review.js', 'js/src/jobs/application-options.js',
           'js/src/web/application-panel.js', 'js/src/storage/migrations/index.js']})
