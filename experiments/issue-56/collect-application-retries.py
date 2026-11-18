"""Verify and archive finite backed generic-error retry evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-retries')
fragments = {
    'focused-final': ['pass 141', 'fail 0'],
    'deno-new-final': ['31 passed | 0 failed'],
    'refactor-final': ['pass 60', 'fail 0'],
    'deno-refactor-final': ['31 passed | 0 failed'],
    'selection-i18n-final': ['pass 35', 'fail 0'],
    'before': ["'provider-error'", "'closed'"],
    'before-native': ["'provider-error'", "'closed'"],
    'native-final': ['"nativeRejections":1', '"backedAnswers":2',
                     '"fiveHourBoundary":true', '"reviewOnlyReopen":true',
                     '"separatelyConfirmedRetry":true',
                     '"originalFailureRetained":true', '"pageErrors":[]',
                     'OK (chromium)'],
    'format-final': ['All matched files'],
    'mcp-corrected-server': ['"closed":true', '"pageErrors":[]'],
    'before-mcp-server': ['"closed":true', '"pageErrors":[]'],
}
for label, values in fragments.items():
    assert all(value in read(label) for value in values), label
assert read('native-final').count('"phase":"passed"') == 9
assert all(not read(label).strip() for label in ['lint-final', 'secrets-final', 'diff-final'])
assert 'ERROR:' not in read('duplication-final')
for label, values in {
    'before': ['"exactParentMissingQueue":true'],
    'final': ['"backedFiveHourWait":true', '"freshReviewOnly":true',
              '"separateRestoreAndSend":true', '"fourLocales":true'],
}.items():
    result = json.loads((logs / f'application-retries-mcp-{label}.json').read_text())
    content = '\n'.join(item.get('text', '') for item in result['content'])
    assert not result.get('isError'), label
    assert all(value in content for value in [*values, '"browsersClosed":true', '"pageErrors":[]']), label
parent = json.loads((logs / 'application-retries-parent-main-final.json').read_text())
assert parent['headSha'] == '37d0a3c9df2128d8076132e267f96f777dac3307'
assert parent['conclusion'] == 'success'
assert all(run['conclusion'] == 'success' and run['headSha'] == parent['headSha']
           for run in json.loads((logs / 'application-retries-parent-runs.json').read_text()))
metadata = {
    'parent': parent['headSha'], 'parent_ci': 'all five workflows pass',
    'focused_application_node_tests': 141, 'new_deno_tests': 31,
    'post_consolidation_node_tests': 60, 'post_consolidation_deno_tests': 31,
    'vacancy_selection_tests': 10, 'dictionary_tests': 25,
    'native_chromium_scenarios': 9, 'retry_ms': 18000000,
    'queue_durable': False, 'synthetic_provider': True, 'issue_complete': False,
    'remaining_inventory_rows': 81,
    'remaining': ['automatic paced queue revisits', 'supervised one-application preset',
                  'recruiter-panel behavior', 'all original unchecked requirements'],
}
sources = changed_sources(root) + evidence_logs(root, 'application-retries')
sources.append('ci-logs/application-session-reference.txt')
bundle(root, sources, 'docs/case-studies/issue-56/data/application-retries.tar.gz',
       metadata, 'application-retries-*.png', before=dict.fromkeys([
           'js/src/jobs/application-service.js', 'js/src/jobs/application-review.js',
           'js/src/jobs/application-deferrals.js', 'js/src/web/app.min.js'], '37d0a3c9'))
