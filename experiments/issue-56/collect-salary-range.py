"""Verify finite salary-interval evidence without claiming full QA15 acceptance."""
import base64
import hashlib
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-range')
assert 'pass 1' in read('parent-final') and 'fail 3' in read('parent-final')
assert 'numeric alternatives remain unresolved in the native select' in read('native-parent')
evidence['verify_evidence'](read, {
    'focused-final': ['pass 51', 'fail 0', 'skipped 0'],
    'syntax-final': ['pass 4', 'fail 0', 'skipped 0'],
    'native-final': ['[forms-salary-options]', '"receipts":2', '"ambiguousHeld":true',
                     '"recovered":true', '"closed":true', '"submissions":0',
                     '[e2e-forms-reader] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, before in [('before', True), ('after', False)]:
    result = json.loads((logs / f'salary-range-mcp-{phase}-final.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt == {'before': before, 'ambiguousHeld': not before,
                       'receipts': 1 if before else 2, 'recovered': True, 'closed': True}
    server = json.loads(read(f'mcp-{phase}-server-final').splitlines()[-1])
    assert server['submissions'] == 0 and len(server['reads']) == 1
    row = server['reads'][0]
    assert row['closed'] and row['salaryOptions'] == {
        'both': '' if before else '0',
        'ambiguous': 'ambiguous' if before else '',
        'nearest': None if before else '1',
        'owner': 'Keep my explanation',
    }
    assert row['events'] == (['input', 'change'] if before else
                             ['input', 'change', 'click', 'input', 'change'])
pin = 'fa0991b8c2d0896fb3b4be6c69947f0590094b15'
references = []
for tag in ['readme', 'tests']:
    name = f'ci-logs/salary-options-reference-{tag}.json'
    response = json.loads((root / name).read_text())
    content = base64.b64decode(response['content'])
    assert f'?ref={pin}' in response['url']
    assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == response['sha']
    references.append(name)
sources = evidence['changed_sources'](root)
evidence['bundle'](root,
    [*sources, *evidence['evidence_logs'](root, 'salary-range'), *references],
    'docs/case-studies/issue-56/data/salary-range-syntax.tar.gz', {
        'acceptance': False, 'parentFailures': 3, 'focusedTests': 51,
        'finalSyntaxTests': 4, 'nativeScenarios': 1, 'independentMcpRuns': 2,
        'nativeSubmissions': 0, 'mcpSubmissions': 0,
        'reference': pin, 'pending': 'Exact-head hosted checks and all 40 unchecked original criteria',
        'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                         for name in sources},
    }, 'issue-56-salary-range-*.png', before={
        'js/src/automation/salary-options.js': '13806114',
        'js/src/automation/salary-question.js': '13806114',
    })
