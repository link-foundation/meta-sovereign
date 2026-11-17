"""Bind the individual-overlap regression to native holds and source bytes."""
from evidence_bundle import evidence_context, verify_evidence, changed_sources, evidence_logs, bundle, verify_salary_watch_mcp

root, logs, read = evidence_context(__file__, 'salary-band-overlap')
assert 'fail 3' in read('parent') and 'pass 1' in read('parent')
verify_evidence(read, {
    'focused': ['pass 30', 'fail 0', 'skipped 0'],
    'contracts': ['pass 1', 'fail 0'],
    'native-parent': ['"before":true', '"nativeReceipts":1', '"pageErrors":[]'],
    'native-final': ['"before":false', '"nativeReceipts":0', '"pageErrors":[]'],
    'browser-final': ['"overlap":{"cases":1', '"nativeReceipts":0',
                      '[e2e-question-salary-options] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, sent in [('before', True), ('after', False)]:
    receipt = verify_salary_watch_mcp(logs, 'salary-band-overlap', phase, sent)
    assert receipt['salary']['amounts'] == {'net': 6000, 'gross': 7100}
bundle(root,
    [*changed_sources(root), *evidence_logs(root, 'salary-band-overlap'),
     'ci-logs/salary-band-overlap-mcp-code.mjs'],
    'docs/case-studies/issue-56/data/salary-band-overlap.tar.gz', {
        'acceptance': False, 'parentFailures': 3, 'focusedTests': 30,
        'parentNativeSelections': 1, 'correctedNativeSelections': 0,
        'pending': 'Complete QA15 mapping and exact-source hosted verification',
    }, '*salary-band-overlap.png', before={
        'js/src/automation/salary-options.js': '93271fee',
    })
