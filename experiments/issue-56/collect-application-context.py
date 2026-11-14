"""Retain confirmed context-choice evidence without claiming automatic HH parity."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-context')
checks = {
    'node-final': ('pass 32', 'fail 0'),
    'deno-final': ('17 passed | 0 failed',),
    'compatibility': ('pass 44', 'fail 0'),
    'before': ('jobs-application-input',),
    'before-native': ('Contextual resume choice is missing.',),
    'native-final': ('"phase":"passed"', '"checkedHash":"english"',
                     '"exportLanguage":"ru"', '"sends":0', '"locales":4',
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
mcp = json.loads((logs / 'application-context-mcp-final.json').read_text())
assert mcp.get('isError') is not True
report = '\n'.join(item.get('text', '') for item in mcp['content'])
assert all(fragment in report for fragment in (
    '"checkedHash":"english"', '"exportLanguage":"ru"', '"sends":0',
    '"ownerValuesPreserved":true', '"fourLocales":true',
    '"browsersClosed":true', '"errors":[]'))
helpers = [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-fixture.mjs',
    'experiments/issue-56/application-run-fixture.mjs',
    'experiments/issue-56/resume-language-fixture.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-native-request.mjs',
    'js/tests/helpers/application-controls.mjs',
    'ci-logs/hh-reference-readme.md',
    'ci-logs/application-popup-reference-resume.mjs',
    'ci-logs/application-context-reference-letter.mjs',
]
parent = '326acade6133ce6c14c50a96dba4e60abba22c5a'
bundle(root, [*changed_sources(root), *helpers,
              *evidence_logs(root, 'application-context')],
       'docs/case-studies/issue-56/data/application-context.tar.gz', {
           'parent': parent, 'node_focused': 32, 'new_deno': 17,
           'recovery_ownership_session_dictionary': 44, 'native_chromium': 1,
           'independent_mcp': 1, 'refused_unsafe_native_targets': 3,
           'application_sends': 0, 'original_inventory_unchecked': 81,
           'issue_complete': False, 'authenticated_provider': False,
           'exact_head_ci_still_required': True,
           'unfinished': ['automatic selection before potentially immediate entry',
                          'durable same-document owner resume overrides',
                          'language-aware standard letters',
                          'authenticated HH02/HH06 parity',
                          'all original unchecked acceptance criteria'],
       }, 'application-context-*.png', before={name: parent for name in (
           'js/src/jobs/application-resumes.js', 'js/src/jobs/application-page.js',
           'js/src/jobs/application-review.js', 'js/src/jobs/application-options.js',
           'js/src/cli/application-command.js', 'js/src/web/application-api.js',
           'js/src/web/app.min.js')})
