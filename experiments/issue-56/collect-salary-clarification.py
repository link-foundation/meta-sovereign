"""Preserve finite salary clarification regressions and exact parent evidence."""
import base64
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-clarification')
assert 'pass 0' in read('before-final') and 'fail 5' in read('before-final')
assert "+ ''" in read('browser-before') and 'ERR_ASSERTION' in read('browser-before')
evidence['verify_evidence'](read, {
    'focused': ['pass 26', 'fail 0', 'skipped 0'],
    'browser-after': ['[salary-clarification]', '"textSends":0',
                      '"ownerDraftPreserved":true', '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
references = {}
pin = 'fa0991b8c2d0896fb3b4be6c69947f0590094b15'
for tag, filename in [('chat', 'chat-salary-clarification.test.mjs'),
                      ('questions', 'salary-questions.test.mjs'), ('hourly', 'hourly-salary.test.mjs')]:
    response = json.loads((logs / f'salary-clarification-reference-{tag}.json').read_text())
    content = base64.b64decode(response['content'])
    assert response['path'] == f'tests/{filename}' and f'?ref={pin}' in response['url']
    assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == response['sha']
    references[response['path']] = {'revision': pin, 'blob': response['sha']}
raw = json.loads((logs / 'salary-clarification-mcp-result.json').read_text())
result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
expected = 'От $7 100 в месяц до вычета налогов.'
assert result == dict(text=expected, currency='USD', basis='gross', status='review',
                      prefilled=True, draftExists=True)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    stats=dict(clicks=0, textSends=0, draft=expected), resourcesClosed=True, liveProvider=False)
sources = evidence['changed_sources'](root, 'deacbb7d')
before = dict.fromkeys(['js/src/automation/salary-question.js',
                       'js/src/automation/question-salary.js',
                       'js/src/automation/question-answers.js'], 'deacbb7d')
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'salary-clarification')],
                   'docs/case-studies/issue-56/data/salary-clarification-contract.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 26, 'parentFailures': 5,
    'nativeBrowserScenarios': 1, 'independentMcpScenarios': 1, 'references': references,
    'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'pending': 'Exact-source hosted checks, full QA12 and all other original unchecked requirements',
}, 'issue-56-salary-clarification-*.png', before=before)
