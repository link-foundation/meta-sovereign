"""Preserve bounded pay guidance regressions, actual receipts and the CI failure."""
import json
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
markers = {
    'before.log': 'fail 7',
    'browser-before.log': 'form introduction determines the minimum hourly pay and comfortable rate',
    'focused-node.log': 'pass 37',
    'focused-deno.log': '37 passed | 0 failed',
    'format-check.log': 'All matched files use Prettier code style!',
}
for suffix, marker in markers.items():
    assert marker in (logs / f'forms-pay-{suffix}').read_text(), suffix
assert not (logs / 'forms-pay-lint.log').read_text().strip()
assert 'ERROR: jscpd' not in (logs / 'forms-pay-duplication.log').read_text()
actual = (logs / 'forms-pay-browser-after.log').read_text()
assert 'OK (chromium)' in actual
receipt = json.loads(next(line.split('] ', 1)[1] for line in actual.splitlines()
                          if line.startswith('[forms-pay]')))
expected = {'hourly': 'Минимум — 2 000 ₽ в час на руки. Комфортная ставка — 2 700 ₽ в час на руки.',
            'monthly': '', 'ownerPay': 'Owner keeps this pay answer', 'technical': ''}
assert receipt == dict(values=expected, receipts=1, closed=True, submits=0)
independent = json.loads((logs / 'forms-pay-mcp.json').read_text())
assert independent['receipts'] == 1 and independent['reviewClosed'] and not independent['phoneOverflow']
assert 'Minimum pay source: Form introduction' in independent['proposals'][0]
server = json.loads((logs / 'forms-pay-mcp-server.log').read_text().splitlines()[-1])
assert server['submissions'] == 0 and len(server['reads']) == 1
assert server['reads'][0]['closed'] and server['reads'][0]['values'] == expected
sources = (logs / 'forms-pay-changed-js.txt').read_text().splitlines()
sources += [f'ci-logs/forms-pay-{name}' for name in [
    *markers, 'lint.log', 'build.log', 'browser-after.log', 'mcp.json',
    'mcp-console.log', 'mcp-server.log', 'duplication.log', 'evidence-refactor.log',
    'current-runs.json', 'ci-jobs.json', 'parent-lint.log', 'main-fetch.log',
    'reference-vacancy.mjs',
]]
sources += ['ci-logs/forms-timezone-reference-requirements.md',
            'ci-logs/forms-timezone-reference-head.json',
            'docs/case-studies/issue-56/forms-pay-guidance.md',
            'experiments/issue-56/collect-forms-pay.py',
            'experiments/issue-56/check-evidence-bundles.py']
metadata = {'date': '2026-11-11', 'preceding_feature_head': 'dacc7c171bb200664f14972db47e776f0a7e9cc1',
            'node_checks': 37, 'deno_checks': 37, 'browser': receipt, 'mcp': independent,
            'actual_values': server, 'parent_failed_job': 130226919907,
            'remaining': 'Full provider vacancy discovery, automatic filling and every unchecked issue criterion remain required.'}
bundle(root, sources, 'docs/case-studies/issue-56/data/forms-pay-guidance.tar.gz', metadata,
       'issue-56-forms-pay-*.png', before={name: 'dacc7c17' for name in [
           'js/src/automation/question-salary.js', 'js/src/automation/salary-config.js',
           'js/src/forms/answer-plan.js', 'js/src/forms/answer-learning.js',
       ]})
