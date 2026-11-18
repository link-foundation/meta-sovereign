"""Preserve exact-parent policy loss and bounded worker/signal verification."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-run')
for name, count in [('focused-final', 62), ('prefill-final', 15), ('i18n-final', 4)]:
    assert f'pass {count}' in read(name) and 'fail 0' in read(name), name
assert '11 passed | 0 failed' in read('deno-final')
assert 'new vacancy inherits the worker policy' in read('before')
assert 'native reopening retains the worker questionnaire policy' in read('before-native')
for name, values in [
    ('before-mcp-final', ['"parentLostPolicy":true', '"pageErrors":[]']),
    ('mcp-final', ['"workerModesRetained":true', '"resumedReviewOnly":true',
                   '"identityOnlyIntent":true', '"pageErrors":[]']),
]:
    result = json.loads((logs / f'application-run-{name}.json').read_text())
    assert not result.get('isError'), name
    text = '\n'.join(item.get('text', '') for item in result['content'])
    assert all(value in text for value in values), name
native = read('native-group-final')
assert '[e2e-job-application] OK (chromium)' in native
assert native.count('"phase":"passed"') == 6
for value in ['"workerPauseRetained":true', '"workerQuestionnairePolicyRetained":true',
              '"resumedReviewOnly":true', '"submissions":0', '"browsersClosed":true']:
    assert value in native, value
assert '"closed":true' in read('mcp-server')
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'All matched files' in read('format-final')
assert 'ERROR:' not in read('duplication-final')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application-run')],
       'docs/case-studies/issue-56/data/application-run-modes.tar.gz',
       dict(parent='d0a5e5e5c32fc151bb0b2f67caec225a6ded5c2f', node_tests=77,
            deno_tests=11, dictionary_checks=4, native_scenarios=6,
            policies_durable=False, signal_http_exposed=False,
            authenticated_provider=False, issue_complete=False,
            exact_head_ci_required=True,
            unfinished=['automatic deferral backups', 'RAM-only deferred queue',
                        'supervised one-application preset', 'popup recovery',
                        'original unchecked inventory']),
       'application-run-*.png', before={name: 'd0a5e5e5' for name in [
           'js/src/jobs/application-service.js', 'js/src/jobs/application-actions.js',
           'js/src/jobs/application-review.js', 'js/src/cli/application-command.js',
           'js/src/web/locales/en-application.js', 'js/src/web/app.min.js']})
