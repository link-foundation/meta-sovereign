"""Preserve contextual personal salary template failures and corrected evidence."""
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-template-context')
assert 'pass 0' in read('parent') and 'fail 6' in read('parent')
assert 'I expect $6 000, negotiable.' in read('browser-before')
evidence['verify_evidence'](read, {
    'focused': ['pass 33', 'fail 0', 'skipped 0'],
    'browser-after': ['[salary-template-context]', '"textSends":0',
                      '"ownerDraftPreserved":true', '"rulesPreserved":true',
                      '[e2e-question-controls] OK (chromium)'],
    'browser-compatible': ['[salary-intent]', '"textSends":0',
                           '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
response = json.loads((logs / 'salary-template-context-mcp-result.json').read_text())
result = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
expected = 'I expect 5 500 €, negotiable.'
assert result == dict(text=expected, currency='EUR', prefilled=True)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    stats=dict(clicks=0, textSends=0, draft=expected), resourcesClosed=True, liveProvider=False)
sources = evidence['changed_sources'](root, 'e1d8e108')
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'salary-template-context')],
                   'docs/case-studies/issue-56/data/salary-template-context.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 33, 'parentFailures': 6,
    'nativeBrowserScenarios': 2, 'independentMcpScenarios': 1,
    'pending': 'Exact-source hosted checks, complete salary contracts and all other unchecked requirements',
}, 'issue-56-salary-template-context-*.png', before={
    'js/src/automation/salary-template.js': 'e1d8e108',
    'js/src/automation/salary-wording.js': 'e1d8e108',
})
