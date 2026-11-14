"""Preserve actual-parent absence, backed deferral and finite refusal evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-deferral')
for name, count in [('focused-final', 83), ('forms-final', 27), ('i18n-final', 25)]:
    assert f'pass {count}' in read(name) and 'fail 0' in read(name), name
assert '21 passed | 0 failed' in read('deno-final')
assert 'is not a function' in read('before')
assert '404' in read('before-native')
for name, values in [
    ('before-mcp-final', ['"parentMissingDeferral":true', '"pageErrors":[]']),
    ('mcp-current-final', ['"backedQuestionnaire":true', '"queueSurvivesUiReload":true',
                           '"retryOnlyReviews":true', '"restored":2',
                           '"submissions":0', '"identityOnlyIntent":true',
                           '"pageErrors":[]']),
]:
    result = json.loads((logs / f'application-deferral-{name}.json').read_text())
    assert not result.get('isError'), name
    text = '\n'.join(item.get('text', '') for item in result['content'])
    assert all(value in text for value in values), name
native = read('native-group-final')
assert '[e2e-job-application] OK (chromium)' in native
assert native.count('"phase":"passed"') == 7
for value in ['"actualBackup":2', '"unapprovedKnowledge":true',
              '"reviewOnlyRetry":true', '"explicitlyRestored":2',
              '"submissions":0', '"ownedBrowsersClosed":true']:
    assert value in native, value
assert '"closed":true' in read('mcp-current-server')
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'All matched files' in read('format-final')
assert 'ERROR:' not in read('duplication-final')
parent_ci = json.loads((logs / 'application-deferral-ci-parent-current.json').read_text())
assert parent_ci['headSha'] == '5e622049f27c9610f77c51aafcae786643ed909d'
assert parent_ci['conclusion'] == 'success'
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application-deferral')],
       'docs/case-studies/issue-56/data/application-deferrals.tar.gz',
       dict(parent=parent_ci['headSha'], application_tests=83,
            shared_form_tests=27, dictionary_checks=25,
            deno_tests=21, native_scenarios=7,
            queue_durable=False, browser_intent_identity_only=True,
            failed_capture_retains_live_form=True,
            reopening_replays_actions=False, learning_approved=False,
            authenticated_provider=False, issue_complete=False,
            exact_head_ci_required=True,
            unfinished=['automatic mode-driven deferral', 'generic-error five-hour retry',
                        'normal queue pacing', 'supervised one-application preset',
                        'popup recovery', 'original unchecked inventory']),
       'application-deferral-*.png', before={name: '5e622049' for name in [
           'js/src/jobs/application-service.js', 'js/src/forms/answer-learning.js',
           'js/src/cli/application-command.js', 'js/src/web/application-session.js',
           'js/src/web/application-panel.js', 'js/src/web/app.min.js']})
