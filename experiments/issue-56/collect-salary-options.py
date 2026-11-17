"""Check finite salary-option regressions and archive their exact source evidence."""
import base64
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-options')
assert 'pass 0' in read('parent') and 'fail 4' in read('parent')
assert 'both bases share a unique containing native select option' in read('browser-before')
evidence['verify_evidence'](read, {
    'focused': ['pass 29', 'fail 0', 'skipped 0'],
    'browser-final': ['[forms-salary-options]', '"receipts":2', '"recovered":true',
                      '"closed":true', '"submissions":0',
                      '[e2e-forms-reader] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
pin = 'fa0991b8c2d0896fb3b4be6c69947f0590094b15'
references = {}
for tag, path in [('readme', 'README.md'), ('tests', 'tests/salary-options.test.mjs')]:
    response = json.loads((logs / f'salary-options-reference-{tag}.json').read_text())
    content = base64.b64decode(response['content'])
    assert response['path'] == path and f'?ref={pin}' in response['url']
    assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == response['sha']
    references[path] = {'revision': pin, 'blob': response['sha']}
result = json.loads((logs / 'salary-options-mcp-result.json').read_text())
text = result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0]
assert json.loads(text) == {
    'both': 'USD 5000–8000', 'nearest': 'USD 6500–8000', 'receipts': 2,
    'recovered': True, 'nearestRequiresReview': True, 'closed': True,
}
server = json.loads(read('mcp-server').splitlines()[-1])
assert server['submissions'] == 0 and len(server['reads']) == 1
record = server['reads'][0]
assert record['closed'] and record['events'] == ['input', 'change', 'click', 'input', 'change']
sources = evidence['changed_sources'](root)
before = dict.fromkeys([
    'js/src/automation/question-salary.js', 'js/src/automation/salary-options.js',
], '640de38b')
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'salary-options')],
                   'docs/case-studies/issue-56/data/salary-option-contract.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 29, 'parentFailures': 4,
    'nativeBrowserScenarios': 1, 'independentMcpScenarios': 1,
    'references': references,
    'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                     for name in sources},
    'pending': 'Exact-source hosted checks, full QA12/QA13/QA15 and all other unchecked original requirements',
}, 'issue-56-salary-options-*.png', before=before)
