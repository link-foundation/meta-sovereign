"""Preserve finite saved-boundary regressions and actual native receipts."""
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-band-saved')
assert 'fail 5' in read('parent-final') and 'pass 0' in read('parent-final')
evidence['verify_evidence'](read, {
    'focused-final': ['pass 33', 'fail 0', 'skipped 0'],
    'native-parent': ['"before":true', '"nativeReceipts":0',
                      '[e2e-salary-band-saved] OK (chromium)'],
    'native-final': ['"before":false', '"nativeReceipts":1', '"textSends":0',
                     '"pageErrors":[]', '[e2e-salary-band-saved] OK (chromium)'],
    'browser-final': ['verifySalaryBandSafety', 'verifySalaryBandWatch',
                      'verifySalaryBandSaved', '[e2e-question-salary-options] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, before in [('before', True), ('after', False)]:
    result = json.loads((logs / f'salary-band-saved-mcp-{phase}.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt['before'] == before
    assert receipt['phase'] == ('review' if before else 'sent')
    if not before:
        assert receipt['salary']['option']['contained']
        assert receipt['option'] == 'USD 5001–7999'
        assert receipt['receipt']['messageId'] == '102'
    server = json.loads(read(f'mcp-{phase}-server').splitlines()[-1])
    assert server['resourcesClosed'] and not server['liveProvider']
    assert server['stats'] == {'clicks': 0 if before else 1, 'textSends': 0, 'draft': ''}
sources = [name for name in evidence['changed_sources'](root)
           if name != 'experiments/issue-56/desktop-artifact-metadata.py']
evidence['bundle'](root,
    [*sources, *evidence['evidence_logs'](root, 'salary-band-saved'),
     'ci-logs/salary-band-saved-mcp-code.mjs'],
    'docs/case-studies/issue-56/data/salary-band-saved.tar.gz', {
        'acceptance': False, 'parentFailures': 5, 'focusedTests': 33,
        'nativePositiveReceipts': 1, 'mcpPositiveReceipts': 1, 'textSends': 0,
        'pending': 'Full QA15 mapping, exact-head hosted checks and all 40 unchecked original criteria',
        'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                         for name in sources},
    }, '*salary-band-saved.png', before={
        'js/src/automation/question-salary.js': '549635f2',
        'js/src/web/app.min.js': '549635f2',
    })
