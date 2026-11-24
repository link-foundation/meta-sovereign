"""Verify the exact-parent failures and finite native content boundary evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, _, read = evidence_context(__file__, 'hh-content')
checks = {
    'before': ('tests 22', 'fail 12', 'Content read before HH verification:'),
    'before-native': ('Assignment instructions escaped HH verification.',),
    'focused-final': ('pass 59', 'fail 0'),
    'deno-final': ('59 passed | 0 failed',),
    'integrated-native': ('"content":{"markers":2,"readers":4,"paths":5',
                          '"sends":0', '"errors":[]', 'OK (chromium)'),
    'workplace-native': ('"cases":5,"attached":9,"detached":9',
                         '"saves":0,"errors":[]', 'OK (chromium)'),
    'format-final': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
duplication = read('duplication-final')
assert 'Found ' in duplication and 'HTML report saved' in duplication
assert 'ERROR:' not in duplication and 'MODULE_NOT_FOUND' not in duplication
rows = [json.loads(line.split(' ', 1)[1]) for line in read('native-final').splitlines()
        if line.startswith('[browser-scenario] ')]
receipt = next(row['result'] for row in rows if row['phase'] == 'passed')
assert receipt == dict(markers=2, readers=4, paths=5, holds=12, ordinary=18, foreignSaveDialogPreserved=True,
                       sensitiveReads=0, actions=0, errors=[])
parent = '63f9f5592a3b27765a9acbbe58e49ce312d626e0'
sources = changed_sources(root) + evidence_logs(root, 'hh-content')
sources += ['experiments/issue-56/application_parent_fixture.py',
            'js/tests/helpers/e2e-cv-workplace-readback.mjs',
            'js/tests/helpers/e2e-cv-workplace-prepare.mjs',
            'ci-logs/ci-63f9-progress.json']
before = ('js/src/assignments/source-document.js', 'js/src/jobs/cv-prepare-document.js',
          'js/src/jobs/cv-prepare-workplace.js', 'js/src/jobs/cv-watch-document.js',
          'js/src/jobs/cv-workplace-controls.js')
bundle(root, sources, 'docs/case-studies/issue-56/data/hh-content-boundaries.tar.gz',
       dict(published_parent=parent, parent_failed=12, parent_total=22,
            node_passed=59, deno_passed=59, native_content=receipt,
            integrated_hh_scenario=True, native_workplace_cases=5,
            authenticated_provider=False, original_incomplete_rows=81,
            issue_complete=False, exact_head_ci_required=True),
       'hh-content-*.png', before={name: parent for name in before})
