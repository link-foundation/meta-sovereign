"""Preserve ordinary salary-intent failures and bounded corrected evidence."""
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-intent')
assert 'pass 0' in read('parent-final') and 'fail 6' in read('parent-final')
assert 'ERR_ASSERTION' in read('browser-before')
evidence['verify_evidence'](read, {
    'focused': ['pass 34', 'fail 0', 'skipped 0'],
    'browser-after': ['[salary-intent]', '"textSends":0',
                      '"ownerDraftPreserved":true', '"rulesPreserved":true',
                      '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
response = json.loads((logs / 'salary-intent-mcp-result.json').read_text())
result = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
expected = 'От 6 500 € в месяц до вычета налогов.'
assert result == dict(text=expected, basis='gross', prefilled=True)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    stats=dict(clicks=0, textSends=0, draft=expected), resourcesClosed=True, liveProvider=False)
sources = evidence['changed_sources'](root, '6a2b60cb')
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'salary-intent')],
                   'docs/case-studies/issue-56/data/salary-intent-contract.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 34, 'parentFailures': 6,
    'nativeBrowserScenarios': 1, 'independentMcpScenarios': 1,
    'pending': 'Exact-source hosted checks, complete salary contracts and all other unchecked requirements',
}, 'issue-56-salary-intent-*.png', before={
    'js/src/automation/salary-question.js': '6a2b60cb',
})
