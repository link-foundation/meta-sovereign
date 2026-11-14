"""Archive acknowledged CV-choice history and finite regression evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-preference')
checks = {
    'node-final-isolated': ('pass 50', 'fail 0'),
    'deno-final': ('18 passed | 0 failed',),
    'node-deduplicated': ('pass 7', 'fail 0'),
    'deno-deduplicated': ('7 passed | 0 failed',),
    'before': ('undefined',),
    'before-native': ('Saved resume preference is missing.',),
    'native-final': ('"phase":"passed"', '"acknowledgedResumeHistory":true',
                     '"entryClicks":0', '"sends":0', '"locales":4',
                     '"errors":[]', '"browsersClosed":true', 'OK (chromium)'),
    'mcp-server': ('"opens":2', '"closed":true', '"providerClicks":0',
                   '"pageErrors":[]', '"liveProvider":false'),
    'format-check-final': ('All matched files use Prettier code style!',),
}
for label, fragments in checks.items():
    assert all(fragment in read(label) for fragment in fragments), label
assert not any(read(label).strip() for label in (
    'lint-final', 'secrets-final', 'diff-final', 'rust-format'))
assert 'ERROR:' not in read('duplication-final')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
mcp = json.loads((logs / 'application-preference-mcp-final.json').read_text())
assert mcp.get('isError') is not True
report = '\n'.join(item.get('text', '') for item in mcp['content'])
assert all(fragment in report for fragment in (
    '"acknowledgedResumeHistory":true', '"retainedNativeChoice":true',
    '"entryClicks":0', '"sends":0', '"ownerValuesPreserved":true',
    '"fourLocales":true', '"browsersClosed":true', '"errors":[]'))
helpers = [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-resume-fixture.mjs',
    'experiments/issue-56/application-context-fixture.mjs',
    'experiments/issue-56/application-run-fixture.mjs',
    'experiments/issue-56/application-resume-native-fixture.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-controls.mjs',
    'ci-logs/hh-reference-readme.md',
]
parent = '1e97b9fa555f33d12df5a101c317ea5c4b6082ca'
bundle(root, [*changed_sources(root), *helpers,
              *evidence_logs(root, 'application-preference')],
       'docs/case-studies/issue-56/data/application-preference.tar.gz', {
           'parent': parent, 'node_focused': 50, 'deno_focused': 18,
           'native_chromium': 1, 'independent_mcp': 1,
           'application_entry_clicks': 0, 'application_sends': 0,
           'original_inventory_unchecked': 81, 'issue_complete': False,
           'authenticated_provider': False, 'exact_head_ci_still_required': True,
           'native_schema': 16, 'rust_compilation': 'hosted CI required',
           'unfinished': ['automatic employer-context resume selection',
                          'durable owner overrides against automation',
                          'language-aware standard letters',
                          'authenticated HH02/HH06 parity',
                          'all original unchecked acceptance criteria'],
       }, 'application-preference-*.png', before={name: parent for name in (
           'js/src/jobs/application-journal.js', 'js/src/jobs/application-resumes.js',
           'js/src/jobs/application-review.js', 'js/src/jobs/application-context-choice.js',
           'js/src/web/application-resume-view.js', 'js/src/web/app.min.js')})
