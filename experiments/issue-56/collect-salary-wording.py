"""Preserve finite approved salary wording checks and exact parent evidence."""
import base64
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-wording')
assert 'pass 0' in read('parent-final') and 'fail 7' in read('parent-final')
assert 'ERR_ASSERTION' in read('browser-before')
evidence['verify_evidence'](read, {
    'focused': ['pass 30', 'fail 0', 'skipped 0'],
    'browser-after': ['[salary-wording]', '"textSends":0',
                      '"ownerDraftPreserved":true', '"rulesPreserved":true',
                      '[e2e-question-controls] OK (chromium)'],
    'browser-compatibility': ['[salary-clarification]', '"textSends":0',
                              '"ownerDraftPreserved":true'],
    'browser-before-capture': ['"ownerWordingLost":true', '"textSends":0'],
    'format-check': ['All matched files use Prettier code style!'],
})
pin = 'fa0991b8c2d0896fb3b4be6c69947f0590094b15'
references = {}
for tag, path in [('source', 'src/salary-questions.mjs'),
                  ('tests', 'tests/salary-questions.test.mjs'),
                  ('hourly', 'tests/hourly-salary.test.mjs')]:
    response = json.loads((logs / f'salary-wording-reference-{tag}.json').read_text())
    content = base64.b64decode(response['content'])
    assert response['path'] == path and f'?ref={pin}' in response['url']
    assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == response['sha']
    references[path] = {'revision': pin, 'blob': response['sha']}
raw = json.loads((logs / 'salary-wording-mcp-result.json').read_text())
result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
expected = 'От 5 500 € ежемесячно на руки.'
assert result == dict(text=expected, rules=['qa-rule:salary-wording'], prefilled=True)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    stats=dict(clicks=0, textSends=0, draft=expected), resourcesClosed=True, liveProvider=False)
sources = evidence['changed_sources'](root, '59252a5e')
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'salary-wording')],
                   'docs/case-studies/issue-56/data/salary-wording-contract.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 30, 'parentFailures': 7,
    'nativeBrowserScenarios': 1, 'independentMcpScenarios': 1, 'references': references,
    'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'pending': 'Exact-source hosted checks, complete QA12 and all other unchecked requirements',
}, 'issue-56-salary-wording-*.png', before={'js/src/automation/question-salary.js': '59252a5e'})
