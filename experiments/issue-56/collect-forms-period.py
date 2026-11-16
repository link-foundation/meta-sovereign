"""Preserve finite form-period regressions, actual browser writes and source bytes."""
import hashlib
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'forms-period')
assert 'pass 0' in read('parent') and 'fail 6' in read('parent')
assert 'explicit final-period preference reaches actual form application' in read('browser-before')
evidence['verify_evidence'](read, {
    'focused': ['pass 24', 'fail 0'],
    'review': ['pass 15', 'fail 0'],
    'browser-final': ['[forms-period]', '"count":5', '"recovered":true',
                      '"submissionAttempted":false', '"submits":0',
                      '"closed":true', '[e2e-forms-reader] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
result = json.loads((logs / 'forms-period-mcp-result.json').read_text())
text = result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0]
assert json.loads(text) == {
    'answer': 'English', 'count': 5, 'receipt': 'applied', 'recovered': True,
    'changedPreference': 'form-prefill-conflict', 'submissionAttempted': False,
    'closed': True,
}
server = json.loads(read('mcp-server').splitlines()[-1])
assert server['submissions'] == 0 and len(server['reads']) == 1
record = server['reads'][0]
assert record['closed'] and record['events'] == ['input']
assert record['values'] == {'language': 'English'}
sources = evidence['changed_sources'](root)
before = dict.fromkeys([
    'js/src/cli/forms-commands.js', 'js/src/cli/forms-review-commands.js',
    'js/src/forms/review-prefill.js', 'js/src/forms/automatic-prefill.js',
    'js/src/server/routes-form-reviews.js', 'js/src/server/routes-forms.js',
], 'd464aa39c523b160611ebf85ed1cb8f421a61214')
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'forms-period')],
                   'docs/case-studies/issue-56/data/forms-period-configuration.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 39, 'parentFailures': 6,
    'nativeBrowserScenarios': 1, 'independentMcpScenarios': 1,
    'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                     for name in sources},
    'pending': 'Fresh exact-source hosted checks, complete QA11 and all 41 unchecked requirements',
}, 'issue-56-forms-period-*.png', before=before)
