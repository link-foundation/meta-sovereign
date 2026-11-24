"""Archive the direct native full-form review regression and finite verification."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-fullform')
checks = {
    'node-final': ('pass 11', 'fail 0'),
    'deno-final': ('11 passed | 0 failed',),
    'compatibility': ('pass 53', 'fail 0'),
    'before': ('jobs-application-confirmation',),
    'before-native': ('Full-form review control is missing.',),
    'native-final': ('"phase":"passed"', '"fullFormNavigation":true',
                     '"entryClicks":0', '"sends":0', '"locales":4',
                     '"refusedUnsafeTargets":3', '"errors":[]',
                     '"browsersClosed":true', 'OK (chromium)'),
    'mcp-server': ('"opens":2', '"closed":true', '"providerClicks":0',
                   '"pageErrors":[]', '"liveProvider":false'),
    'format-check-final': ('All matched files use Prettier code style!',),
}
for label, fragments in checks.items():
    assert all(fragment in read(label) for fragment in fragments), label
assert not any(read(label).strip() for label in ('lint-final', 'secrets-final', 'diff-final'))
assert 'ERROR:' not in read('duplication-final')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
mcp = json.loads((logs / 'application-fullform-mcp-final.json').read_text())
assert mcp.get('isError') is not True
report = '\n'.join(item.get('text', '') for item in mcp['content'])
assert all(fragment in report for fragment in (
    '"fullFormNavigation":true', '"entryClicks":0', '"sends":0',
    '"ownerValuesPreserved":true', '"fourLocales":true',
    '"browsersClosed":true', '"errors":[]'))
helpers = [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-fixture.mjs',
    'experiments/issue-56/application-run-fixture.mjs',
    'experiments/issue-56/application-native-fixture.mjs',
    'experiments/issue-56/application-resume-native-fixture.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-native-request.mjs',
    'js/tests/helpers/application-controls.mjs',
    'ci-logs/hh-reference-readme.md',
    'ci-logs/application-fullform-reference-apply.mjs',
    'ci-logs/application-fullform-reference-response.mjs',
    'ci-logs/application-fullform-reference-vacancies.mjs',
]
parent = '6899b33b04535da1650c150d3a95993b91d793cd'
bundle(root, [*changed_sources(root), *helpers,
              *evidence_logs(root, 'application-fullform')],
       'docs/case-studies/issue-56/data/application-fullform.tar.gz', {
           'parent': parent, 'node_focused': 11, 'new_deno': 11,
           'resume_context_recovery_dictionary': 53, 'native_chromium': 1,
           'independent_mcp': 1, 'refused_unsafe_native_targets': 3,
           'application_entry_clicks': 0, 'application_sends': 0,
           'original_inventory_unchecked': 81, 'issue_complete': False,
           'authenticated_provider': False, 'exact_head_ci_still_required': True,
           'unfinished': ['automatic employer-context resume selection',
                          'durable same-document owner resume overrides',
                          'language-aware standard letters',
                          'authenticated HH02/HH06 parity',
                          'all original unchecked acceptance criteria'],
       }, 'application-fullform-*.png', before={name: parent for name in (
           'js/src/jobs/application-actions.js', 'js/src/jobs/application-page.js',
           'js/src/jobs/application-service.js', 'js/src/cli/application-command.js',
           'js/src/web/application-panel.js', 'js/src/web/app.min.js')})
