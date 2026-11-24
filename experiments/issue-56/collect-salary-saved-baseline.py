"""Require approved saved-baseline regressions and drained native form receipts."""
import json
from evidence_bundle import evidence_context, verify_evidence, changed_sources, evidence_logs, bundle

root, logs, read = evidence_context(__file__, 'salary-saved-baseline')
assert 'fail 2' in read('parent') and 'pass 2' in read('parent')
verify_evidence(read, {
    'focused-final': ['pass 28', 'fail 0', 'skipped 0'],
    'preview-compatibility': ['pass 4', 'fail 0', 'skipped 0'],
    'contracts': ['pass 1', 'fail 0'],
    'native-parent': ['"before":true,"receipts":0', '"submissions":0',
                      '[e2e-forms-reader] OK (chromium)'],
    'native-final': ['"before":false,"receipts":1,"recovered":true',
                     '"configuredSalary":false', '[e2e-forms-reader] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, before in [('before', True), ('after', False)]:
    result = json.loads((logs / f'salary-saved-baseline-mcp-{phase}.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt['baseline'] and receipt['before'] == before and receipt['closed']
    assert receipt['receipts'] == (0 if before else 1)
    assert receipt['configuredSalary'] is False
    if not before:
        assert receipt['recovered']
    server = json.loads(read(f'mcp-{phase}-server').strip().splitlines()[-1])
    assert server['submissions'] == 0 and server['sourceReads'] == []
    assert all(request['method'] == 'GET' for request in server['requests'])
    assert len(server['reads']) == 1 and server['reads'][0]['closed']
    native = server['reads'][0]
    assert native['events'] == ([] if before else ['click', 'input', 'change'])
    assert native['salaryOptions'] == {
        'savedBaseline': None if before else '2', 'both': '', 'ambiguous': '',
        'inclusive': '', 'nearest': None, 'owner': 'Keep my explanation',
    }
bundle(root, [*changed_sources(root), *evidence_logs(root, 'salary-saved-baseline'),
              'ci-logs/salary-saved-baseline-mcp-code.mjs',
              'ci-logs/salary-criteria-reference-salary-options.mjs',
              'ci-logs/salary-criteria-reference-salary-options.test.mjs'],
       'docs/case-studies/issue-56/data/salary-saved-baseline.tar.gz', {
           'acceptance': False, 'parentFailures': 2, 'focusedTests': 28,
           'nativePositiveReceipts': 1, 'mcpPositiveReceipts': 1, 'submissions': 0,
           'pending': 'Complete QA15 mapping, exact-source hosted verification and all 40 unchecked criteria',
       }, 'issue-56-salary-saved-baseline-*.png', before={
           'js/src/automation/question-salary.js': 'db883377',
           'js/src/automation/salary-question.js': 'db883377',
           'js/src/web/app.min.js': 'db883377',
       })
