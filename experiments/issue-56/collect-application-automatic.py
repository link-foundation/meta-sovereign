"""Archive finite automatic-policy reproduction, ownership and interface evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-automatic')
checks = {'focused-final': ('pass 95', 'fail 0'),
          'i18n-final': ('pass 25', 'fail 0'),
          'deno-final': ('12 passed | 0 failed',),
          'native-final': ('OK (chromium)', '"automaticallyBackedAndClosed":true',
                           '"submissions":0', '"browsersClosed":true', '"errors":[]'),
          'before': ('closed', 'deferred'), 'before-native': ('closed', 'deferred'),
          'format-final': ('All matched files',)}
for name, required in checks.items():
    assert all(value in read(name) for value in required), name
assert read('native-draft').count('"phase":"passed"') == 7
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication-final')
for name, required in {
    'before-mcp-final': ['"parentKeepsQuestionnaireOpen":true'],
    'mcp-driver-final': ['"automaticDeferral":true', '"queueSurvivesUiReload":true',
                         '"retryOnlyReviews":true', '"restored":2',
                         '"identityOnlyIntent":true'],
}.items():
    report = json.loads((logs / f'application-automatic-{name}.json').read_text())
    assert not report.get('isError'), name
    result = '\n'.join(block.get('text', '') for block in report['content'])
    assert all(token in result for token in [*required, '"submissions":0', '"pageErrors":[]']), name
for name in ('before-mcp-server', 'mcp-final-server'):
    assert '"closed":true' in read(name), name
ci = json.loads((logs / 'application-automatic-parent-main.json').read_text())
assert ci['headSha'] == '24ef1b88d55df6aa18fcfc951555f511f4232c23'
assert ci['conclusion'] == 'success'
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application-automatic')],
       'docs/case-studies/issue-56/data/application-automatic-deferral.tar.gz',
       dict(parent=ci['headSha'], application_tests=95, dictionary_checks=25,
            deno_new_tests=12, compatible_native_scenarios=7, final_native_scenarios=1,
            actual_answers_preserved=True, learning_approved=False,
            queue_and_modes_durable=False, failed_save_auto_replayed=False,
            synthetic_provider=True, issue_complete=False,
            exact_head_ci_required=True,
            unfinished=['automatic paced queue revisits', 'generic-error five-hour retries',
                        'supervised one-application preset', 'recruiter-panel behavior',
                        'all original unchecked criteria']),
       'application-automatic-*.png', before={name: '24ef1b88' for name in [
           'js/src/jobs/application-service.js', 'js/src/jobs/application-deferrals.js',
           'js/src/jobs/application-actions.js', 'js/src/web/application-session.js',
           'js/src/web/app.min.js']})
