"""Retain guarded default language policy, exact-parent failures and finite evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-language')
required = {
    'focused-node': ['pass 50', 'fail 0'],
    'guards-final-node': ['pass 19', 'fail 0'],
    'control-final-node': ['fail 0'],
    'deno': ['17 passed | 0 failed'],
    'before': ['undefined !== 1'],
    'before-native': ['Default application language control is missing.'],
    'native': ['"standardCorrection":true', '"ownerEditsPreserved":true',
               '"entries":0', '"sends":0', '"locales":4', '"errors":[]', 'OK (chromium)'],
    'mcp-result': ['"correctedLanguage":"en"', '"ownerEditsPreserved":true',
                   '"readOnlyRecovery":true', '"entryClicks":0', '"sends":0', '"browsersClosed":true'],
    'mcp-server': ['"closed":true', '"liveProvider":false', '"pageErrors":[]'],
    'format-check-final': ['All matched files use Prettier code style!'],
}
for label, expected in required.items():
    assert all(fragment in read(label) for fragment in expected), label
for gate in ['lint-final', 'secrets-final', 'diff-final', 'rust-format']:
    assert not read(gate).strip(), gate
assert 'ERROR:' not in read('duplication-final')
parent = 'a74dbc735c570a1abdf15ca4eb3af232494bac65'
helpers = ['experiments/issue-56/application_parent_fixture.py',
           'experiments/issue-56/evidence_bundle.py', 'ci-logs/hh-reference-readme.md']
bundle(root, [*changed_sources(root), *helpers, *evidence_logs(root, 'application-language')],
       'docs/case-studies/issue-56/data/application-language.tar.gz', {
           'published_parent': parent, 'native_schema': 17,
           'node_focused_group': 50, 'node_corrected_session_language': 19,
           'deno_focused': 17, 'native_chromium': 1, 'independent_mcp': 1,
           'entry_clicks': 0, 'sends': 0, 'authenticated_provider': False,
           'original_inventory_unchecked': 81, 'issue_complete': False,
           'exact_head_ci_required': True, 'rust_compilation': 'hosted CI required',
       }, 'application-language-*.png', before={
           name: parent for name in ['js/src/jobs/application-actions.js',
           'js/src/jobs/application-options.js', 'js/src/jobs/application-journal.js',
           'js/src/jobs/application-service.js', 'js/src/web/application-panel.js']})
