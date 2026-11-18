"""Verify the finite numeric salary repair without claiming full QA15 acceptance."""
import base64
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-band-numbers')
assert 'pass 0' in read('parent') and 'fail 5' in read('parent')
assert 'the inclusive native salary floor contains its exact boundary' in read('native-parent')
evidence['verify_evidence'](read, {
    'focused-final': ['pass 52', 'fail 0', 'skipped 0'],
    'native-final': ['"receipts":3', '"inclusive":"floor"', '"ambiguousHeld":true',
                     '"recovered":true', '"closed":true', '"submissions":0',
                     '[e2e-forms-reader] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase, before in [('before', True), ('after', False)]:
    result = json.loads((logs / f'salary-band-numbers-mcp-{phase}.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt == {'before': before, 'inclusiveMatched': not before,
                       'receipts': 2 if before else 3, 'recovered': True, 'closed': True}
    server = json.loads(read(f'mcp-{phase}-server').splitlines()[-1])
    assert server['submissions'] == 0 and len(server['reads']) == 1
    row = server['reads'][0]
    assert row['closed'] and row['salaryOptions'] == {
        'both': '0', 'ambiguous': '', 'inclusive': '' if before else 'floor',
        'nearest': '1', 'owner': 'Keep my explanation',
    }
    expected = ['input', 'change', 'click', 'input', 'change']
    assert row['events'] == expected + ([] if before else ['input', 'change'])
pin = 'fa0991b8c2d0896fb3b4be6c69947f0590094b15'
for index in range(3):
    response = json.loads((logs / f'salary-band-numbers-reference-{index}.json').read_text())
    content = base64.b64decode(response['content'])
    assert f'?ref={pin}' in response['url']
    assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == response['sha']
    assert content == (Path('/tmp/meta-sovereign-issue-56-references') /
                       'konard--hh-job-application-automation' / response['path']).read_bytes()
sources = evidence['changed_sources'](root)
evidence['bundle'](root,
    [*sources, *evidence['evidence_logs'](root, 'salary-band-numbers'),
     'ci-logs/checks-44022664526-133837402167.log',
     'ci-logs/checks-44022664526-133837402167.json',
     'ci-logs/checks-44022664278-133835901747.log'],
    'docs/case-studies/issue-56/data/salary-band-numbers.tar.gz', {
        'acceptance': False, 'parentFailures': 5, 'focusedTests': 52,
        'nativeScenarios': 1, 'independentMcpRuns': 2,
        'nativeSubmissions': 0, 'mcpSubmissions': 0, 'reference': pin,
        'pending': 'Hosted CI corrections, exact-head validation and all 40 unchecked criteria',
        'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                         for name in sources},
    }, 'issue-56-salary-band-numbers-*.png', before={
        'js/src/automation/salary-options.js': '246bf5e6',
    })
