"""Preserve reviewed nearest-band agreement without automatic delivery authority."""
import json
from evidence_bundle import evidence_context, verify_evidence, changed_sources, evidence_logs, bundle

root, logs, read = evidence_context(__file__, 'salary-nearest-bases')
assert 'fail 3' in read('before') and 'pass 1' in read('before')
verify_evidence(read, {
    'focused': ['pass 20', 'fail 0', 'skipped 0'],
    'browser-before': ['"before":true,"receipts":0', '[e2e-forms-reader] OK (chromium)'],
    'browser-final': ['"before":false,"receipts":1,"recovered":true',
                      '"closed":true,"submissions":0,"automatic":false'],
    'baseline-compatibility': ['"receipts":3', '"configuredSalary":false',
                               '[e2e-forms-reader] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})


def inspection(name):
    response = json.loads((logs / f'{name}.json').read_text())
    text = response['content'][0]['text']
    return json.loads(text.split('### Result\n', 1)[1].split('\n###', 1)[0])


for phase in ['before', 'after']:
    before = phase == 'before'
    result = inspection(f'salary-nearest-bases-mcp-{phase}')
    expected = dict(before=before, receipts=int(not before), automatic=False, closed=True)
    if not before:
        expected['recovered'] = True
    assert result == expected
    server = json.loads(read(f'mcp-{phase}-server').splitlines()[-1])
    assert server['submissions'] == 0 and server['sourceReads'] == []
    assert all(request['method'] == 'GET' for request in server['requests'])
    assert len(server['reads']) == (1 if before else 2)
    nearest = server['reads'][0]
    assert nearest['closed'] and nearest['events'] == ([] if before else ['input', 'change'])
    assert nearest['salaryOptions'] == dict(savedBaseline=None, both='' if before else '0',
                                          ambiguous='', inclusive='', nearest=None,
                                          owner='Keep my explanation')
    if not before:
        baseline = inspection('salary-nearest-bases-baseline-compat')
        assert baseline == dict(baseline=True, before=False, receipts=1, recovered=True,
                                configuredSalary=False, closed=True)
        control = server['reads'][1]
        assert control['closed'] and control['events'] == ['click', 'input', 'change']
        assert control['salaryOptions']['savedBaseline'] == '2'
        assert control['salaryOptions']['owner'] == 'Keep my explanation'

bundle(root, [*changed_sources(root), *evidence_logs(root, 'salary-nearest-bases'),
              'ci-logs/salary-nearest-bases-mcp-code.js',
              'ci-logs/salary-nearest-bases-baseline-compat-code.js',
              'ci-logs/salary-criteria-reference-salary-options.mjs',
              'ci-logs/salary-criteria-reference-salary-options.test.mjs'],
       'docs/case-studies/issue-56/data/salary-nearest-bases.tar.gz', {
           'acceptance': False, 'parentFailures': 3, 'passingParentSafetyControls': 1,
           'focusedTests': 20, 'nativeNearestReceipts': 1, 'mcpNearestReceipts': 1,
           'baselineCompatibilityReceipts': 1, 'submissions': 0,
           'pending': 'Complete QA15 mapping, exact-source workflows and all 40 unchecked criteria',
       }, 'issue-56-salary-nearest-bases-*.png', before={
           'js/src/automation/salary-options.js': 'ddd08a57',
           'js/src/web/app.min.js': 'ddd08a57',
       })
