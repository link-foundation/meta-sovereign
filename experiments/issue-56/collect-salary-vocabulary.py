"""Preserve learned salary vocabulary checks and exact parent snapshots."""
import base64
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-vocabulary')
assert 'pass 0' in read('parent-final') and 'fail 6' in read('parent-final')
assert 'ERR_ASSERTION' in read('browser-before')
evidence['verify_evidence'](read, {
    'focused': ['pass 39', 'fail 0', 'skipped 0'],
    'browser-after': ['[salary-vocabulary]', '"textSends":0',
                      '"ownerDraftPreserved":true', '"rulesPreserved":true',
                      '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
response = json.loads((logs / 'salary-vocabulary-reference-source.json').read_text())
content = base64.b64decode(response['content'])
pin = 'fa0991b8c2d0896fb3b4be6c69947f0590094b15'
assert response['path'] == 'src/salary-questions.mjs' and f'?ref={pin}' in response['url']
assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == response['sha']
raw = json.loads((logs / 'salary-vocabulary-mcp-result.json').read_text())
result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
expected = 'From 6 500 € gross per month.'
assert result == dict(text=expected, basis='gross', prefilled=True)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    stats=dict(clicks=0, textSends=0, draft=expected), resourcesClosed=True, liveProvider=False)
sources = evidence['changed_sources'](root, '6b4b4df6')
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'salary-vocabulary')],
                   'docs/case-studies/issue-56/data/salary-vocabulary-contract.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 39, 'parentFailures': 6,
    'nativeBrowserScenarios': 1, 'independentMcpScenarios': 1,
    'reference': {'revision': pin, 'path': response['path'], 'blob': response['sha']},
    'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'pending': 'Exact-source hosted checks, complete QA12 and all other unchecked requirements',
}, 'issue-56-salary-vocabulary-*.png', before=dict.fromkeys([
    'js/src/automation/salary-question.js', 'js/src/automation/question-answers.js',
    'js/src/automation/salary-wording.js'], '6b4b4df6'))
