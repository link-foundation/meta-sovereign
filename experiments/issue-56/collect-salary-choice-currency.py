"""Require unique-choice currency regressions and actual delivery receipts."""
from evidence_bundle import evidence_context, verify_evidence, changed_sources, evidence_logs, bundle, verify_salary_watch_mcp

root, logs, read = evidence_context(__file__, 'salary-choice-currency')
assert 'fail 2' in read('parent') and 'pass 1' in read('parent')
verify_evidence(read, {
    'focused-final': ['pass 23', 'fail 0', 'skipped 0'],
    'contracts': ['pass 1', 'fail 0'],
    'native-parent': ['"before":true', '"nativeReceipts":0', '"pageErrors":[]'],
    'native-final': ['"before":false', '"nativeReceipts":1', '"pageErrors":[]'],
    'browser-final': ['"currency":{"cases":2', '[e2e-question-salary-options] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, sent in [('before', False), ('after', True)]:
    receipt = verify_salary_watch_mcp(logs, 'salary-choice-currency', phase, sent)
    assert receipt['salary']['currency'] == ('USD' if sent else None)
    if sent:
        assert receipt['option'] == 'USD 5001–7999'
        assert receipt['salary']['amount'] == 6000
bundle(root, [*changed_sources(root), *evidence_logs(root, 'salary-choice-currency'),
              'ci-logs/salary-choice-currency-mcp-code.mjs'],
       'docs/case-studies/issue-56/data/salary-choice-currency.tar.gz', {
           'acceptance': False, 'parentFailures': 2, 'focusedTests': 23,
           'pending': 'Complete QA12/QA15 mappings and exact-source hosted verification',
       }, '*salary-choice-currency.png', before={
           'js/src/automation/salary-question.js': 'db66d251',
       })
