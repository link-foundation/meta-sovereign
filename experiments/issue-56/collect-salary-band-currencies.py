"""Preserve configured-currency regressions and actual native option receipts."""
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-band-currencies')
assert 'fail 4' in read('parent') and 'pass 0' in read('parent')
evidence['verify_evidence'](read, {
    'focused-final': ['pass 33', 'fail 0', 'skipped 0'],
    'contracts': ['pass 1', 'fail 0'],
    'native-parent': ['"before":true', '"nativeReceipts":0', '"pageErrors":[]'],
    'native-final': ['"before":false', '"nativeReceipts":1', '"textSends":0'],
    'browser-final': ['verifySalaryBandCurrencies', 'verifySalaryBandSaved',
                      'verifySalaryBandWatch', 'verifySalaryBandSafety',
                      '[e2e-question-salary-options] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, before in [('before', True), ('after', False)]:
    result = json.loads((logs / f'salary-band-currencies-mcp-{phase}.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt['before'] == before
    assert receipt['phase'] == ('review' if before else 'sent')
    if not before:
        assert receipt['salary']['option']['contained']
        assert receipt['option'] == 'pounds 5001–7999'
        assert receipt['receipt']['messageId'] == '102'
    server = json.loads(read(f'mcp-{phase}-server').splitlines()[-1])
    assert server['resourcesClosed'] and not server['liveProvider']
    assert server['stats'] == {'clicks': 0 if before else 1, 'textSends': 0, 'draft': ''}
evidence['bundle'](root,
    [*evidence['changed_sources'](root),
     *evidence['evidence_logs'](root, 'salary-band-currencies'),
     'ci-logs/salary-band-currencies-mcp-code.mjs'],
    'docs/case-studies/issue-56/data/salary-band-currencies.tar.gz', {
        'acceptance': False, 'parentFailures': 4, 'focusedTests': 33,
        'nativeReceipts': 1, 'mcpReceipts': 1, 'textSends': 0,
        'pending': 'Full QA15 mapping, exact-source CI and all 40 unchecked criteria',
    }, '*salary-band-currencies.png', before={
        'js/src/automation/question-salary.js': '935fbf8e',
        'js/src/automation/salary-question.js': '935fbf8e',
    })
