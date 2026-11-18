"""Preserve bounded automatic-band evidence without claiming full acceptance."""
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-band-watch')
assert 'fail 6' in read('parent-final') and 'pass 2' in read('parent-final')
evidence['verify_evidence'](read, {
    'focused-final': ['pass 57', 'fail 0', 'skipped 0'],
    'native-parent': ['"before":true', '"nativeReceipts":0',
                      '[e2e-salary-band-watch] OK (chromium)'],
    'native-final': ['"before":false', '"nativeReceipts":1', '"textSends":0',
                     '"pageErrors":[]', '[e2e-salary-band-watch] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, before in [('before', True), ('after', False)]:
    result = json.loads((logs / f'salary-band-watch-mcp-{phase}.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt['before'] == before
    assert receipt['phase'] == ('review' if before else 'sent')
    assert receipt['salary']['option']['contained']
    if not before:
        assert receipt['option'] == 'USD 5001–8000'
        assert receipt['receipt']['messageId'] == '102'
    server = json.loads(read(f'mcp-{phase}-server').splitlines()[-1])
    assert server['resourcesClosed'] and not server['liveProvider']
    assert server['stats'] == {'clicks': 0 if before else 1, 'textSends': 0, 'draft': ''}
sources = evidence['changed_sources'](root)
evidence['bundle'](root,
    [*sources, *evidence['evidence_logs'](root, 'salary-band-watch')],
    'docs/case-studies/issue-56/data/salary-band-watch.tar.gz', {
        'acceptance': False, 'parentFailures': 6, 'focusedTests': 57,
        'nativePositiveReceipts': 1, 'mcpPositiveReceipts': 1, 'textSends': 0,
        'pending': 'All 40 unchecked original criteria and exact-source hosted acceptance',
        'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                         for name in sources},
    }, '*salary-band-watch.png', before={
        'js/src/automation/question-browser-plan.js': 'f3412a16',
        'js/src/automation/question-unread-answers.js': 'f3412a16',
        'js/src/web/app.min.js': 'f3412a16',
    })
