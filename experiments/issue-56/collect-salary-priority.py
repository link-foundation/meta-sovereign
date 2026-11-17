"""Preserve exact-parent priority failures and bounded corrected evidence."""
import json
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'salary-priority')
assert 'pass 2' in read('parent') and 'fail 3' in read('parent')
assert "'{{salary_currency}}'" in read('browser-before')
evidence['verify_evidence'](read, {
    'focused-final': ['pass 51', 'fail 0', 'skipped 0'],
    'browser-after-final': ['[salary-context-priority]', '"textSends":0',
                            '"ownerDraftPreserved":true', '"rulesPreserved":true',
                            '"tiedPriorityRequiresReview":true', '"narrowLayout":true',
                            '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
response = json.loads((logs / 'salary-priority-mcp-result.json').read_text())
result = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
expected = 'From 6 200 USDT net per month.'
assert result == dict(text=expected, currency='USDT', prefilled=True)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    stats=dict(clicks=0, textSends=0, draft=expected), resourcesClosed=True, liveProvider=False)
diagnostics = {'js/tests/helpers/e2e-page-errors.mjs', 'js/tests/e2e-page-errors.test.js',
               'js/tests/e2e-chat-loading-browser.mjs'}
sources = [name for name in evidence['changed_sources'](root, '27511c5e')
           if name not in diagnostics and 'chat-loading-diagnostic' not in name
           and 'ci-webkit-reload' not in name]
evidence['bundle'](root, [*sources, *evidence['evidence_logs'](root, 'salary-priority')],
                   'docs/case-studies/issue-56/data/salary-context-priority.tar.gz', {
    'acceptance': False, 'focusedNodeTests': 51, 'parentFailures': 3,
    'nativeBrowserScenarios': 2, 'independentMcpScenarios': 1,
    'pending': 'Exact-source hosted checks, complete salary contracts and all other unchecked requirements',
}, 'issue-56-salary-priority-*.png', before={
    'js/src/automation/salary-config.js': '27511c5e',
    'js/src/automation/salary-question.js': '27511c5e',
})
