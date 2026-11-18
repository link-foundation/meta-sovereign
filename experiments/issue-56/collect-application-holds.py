"""Preserve finite native-error reproductions and retained-hold verification."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-holds')
expected_logs = {
    'focused-final': ['pass 110', 'fail 0'],
    'new-final': ['pass 15', 'fail 0'],
    'deno-new-final': ['15 passed | 0 failed'],
    'i18n-final': ['pass 25', 'fail 0'],
    'before': ['1 !== 0'],
    'before-native': ['1 !== 0'],
    'native-final': ['"nativeErrorKinds":6', '"bannerDismissalDoesNotSend":true',
                     '"confirmedDeliveryClearsHold":true', '"submissions":1',
                     '"browsersClosed":true', '"errors":[]', 'OK (chromium)'],
    'format-final': ['All matched files'],
    'mcp-final-server': ['"closed":true', '"pageErrors":[]'],
    'mcp-policy-server': ['"closed":true', '"pageErrors":[]'],
}
for label, fragments in expected_logs.items():
    for fragment in fragments:
        assert fragment in read(label), (label, fragment)
assert all(not read(label).strip() for label in
           ['lint-final', 'secrets-final', 'diff-final'])
assert 'ERROR:' not in read('duplication-final')
mcp_fragments = {
    'before': ['"exactParentSentAfterDismissal":true',
               '"submissionsBeforeManualConfirmation":1'],
    'final': ['"manualHoldRetained":true', '"fourLocaleRecovery":true',
              '"automaticClosureHeld":true', '"submissionsBeforeManualConfirmation":0'],
    'policy-compat': ['"automaticDeferral":true', '"queueSurvivesUiReload":true',
                      '"restored":2', '"submissions":0', '"identityOnlyIntent":true'],
}
for label, fragments in mcp_fragments.items():
    raw = json.loads((logs / f'application-holds-mcp-{label}.json').read_text())
    assert not raw.get('isError'), label
    text = '\n'.join(item.get('text', '') for item in raw['content'])
    assert all(fragment in text for fragment in [*fragments, '"pageErrors":[]']), label
parent = json.loads((logs / 'application-holds-parent-main-final.json').read_text())
assert parent['headSha'] == 'c4a40d2cb2f929c87227357072da9d48f0feb8b7'
metadata = {
    'parent': parent['headSha'], 'parent_ci': parent['conclusion'] or parent['status'],
    'focused_application_tests': 110, 'new_node_and_deno_tests_each': 15,
    'dictionary_checks': 25, 'native_error_variants': 6,
    'synthetic_provider': True, 'manual_confirmed_submissions': 1,
    'automatic_sends_after_dismissal': 0, 'hold_durable': False,
    'remaining_inventory_rows': 81, 'issue_complete': False,
    'remaining': ['five-hour generic-error retries', 'paced automatic queue revisits',
                  'supervised one-application preset', 'recruiter-panel behavior',
                  'all original unchecked criteria'],
}
snapshot_paths = ['js/src/jobs/application-page.js', 'js/src/jobs/application-service.js',
                  'js/src/jobs/application-actions.js', 'js/src/web/app.min.js']
bundle(root, changed_sources(root) + evidence_logs(root, 'application-holds'),
       'docs/case-studies/issue-56/data/application-holds.tar.gz', metadata,
       'application-holds-*.png', before=dict.fromkeys(snapshot_paths, 'c4a40d2c'))
