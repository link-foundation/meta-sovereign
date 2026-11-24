"""Archive checked-language suggestions while leaving native selection unfinished."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'resume-language')
for label, fragments in {
    'node-final': ('pass 19', 'fail 0'),
    'compatibility': ('pass 44', 'fail 0'),
    'deno-final': ('12 passed | 0 failed',),
    'i18n-final': ('pass 25', 'fail 0'),
    'before': ('russian-new',),
    'before-native': ('A checked Russian export must outrank title hints.',),
    'native-final': ('"phase":"passed"', '"opens":1', '"providerClicks":0',
                     '"locales":4', '"pageErrors":[]', 'OK (chromium)'),
    'format-check-final': ('All matched files use Prettier code style!',),
}.items():
    for fragment in fragments:
        assert fragment in read(label), (label, fragment)
assert not any(read(label).strip() for label in ('lint-final', 'secrets-final', 'diff-final'))
assert 'ERROR:' not in read('duplication-final')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
response = json.loads((logs / 'resume-language-mcp-final.json').read_text())
assert response.get('isError') is not True
report = '\n'.join(item.get('text', '') for item in response['content'])
assert '"pageErrors":[]' in report
assert all(fragment in read('mcp-server') for fragment in (
    '"opens":1', '"closed":true', '"providerClicks":0',
    '"pageErrors":[]', '"liveProvider":false'))
parent = 'e8533c0c478ee997c3974caf63798bd74e1619f3'
bundle(root, [*changed_sources(root), *evidence_logs(root, 'resume-language'),
              'ci-logs/application-popup-reference-resume.mjs'],
       'docs/case-studies/issue-56/data/resume-language.tar.gz', {
           'parent': parent, 'node_focused': 19, 'node_compatibility': 44,
           'new_deno': 12, 'dictionary_checks': 25, 'native_chromium': 1,
           'independent_mcp': 1, 'provider_mutations': 0,
           'durable_list_version': 1, 'original_inventory_unchecked': 81,
           'issue_complete': False, 'authenticated_provider': False,
           'exact_head_ci_still_required': True,
           'unfinished': ['native application resume selection',
                          'authenticated HH02/HH06 parity',
                          'all original unchecked acceptance criteria'],
       }, 'resume-language-*.png', before={name: parent for name in (
           'js/src/jobs/resume-list.js', 'js/src/jobs/resume-cache.js',
           'js/src/jobs/service.js', 'js/src/web/vacancy-api.js',
           'js/src/web/vacancy-resumes.js', 'js/src/web/app.min.js')})
