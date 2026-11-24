"""Preserve finite shared-subject regressions and actual browser evidence."""
import json
from evidence_bundle import bundle
from pathlib import Path

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 5' in (logs / 'forms-subject-before.log').read_text()
assert 'pass 33' in (logs / 'forms-subject-after.log').read_text()
assert '33 passed | 0 failed' in (logs / 'forms-subject-deno.log').read_text()
assert not (logs / 'forms-subject-lint.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (logs / 'forms-subject-format-check.log').read_text()
assert 'C# question never borrows a Go answer' in (logs / 'forms-subject-browser-before.log').read_text()
browser_log = (logs / 'forms-subject-browser-after.log').read_text()
assert 'OK (chromium)' in browser_log
browser = json.loads(next(line.split('] ', 1)[1] for line in browser_log.splitlines() if line.startswith('[forms-subjects]')))
expected = {'wrongTechnology': '', 'rightTechnology': 'Three years building Go services', 'ownerTechnology': 'Owner keeps this answer'}
assert browser == dict(values=expected, receipts=1, closed=True, submits=0)
mcp = json.loads((logs / 'forms-subject-mcp.json').read_text())
assert mcp['receipts'] == 1 and mcp['reviewClosed'] and not mcp['phoneOverflow']
assert 'Needs an answer' in mcp['proposals'][0] and 'Proposed:' not in mcp['proposals'][0]
assert 'Proposed: Three years building Go services' in mcp['proposals'][1]
server = json.loads((logs / 'forms-subject-mcp-server.log').read_text().splitlines()[-1])
assert server['submissions'] == 0 and len(server['reads']) == 1
assert server['reads'][0]['closed'] and server['reads'][0]['values'] == expected

names = [f'ci-logs/forms-subject-{suffix}' for suffix in [
    'before.log', 'after.log', 'deno.log', 'lint.log', 'format-check.log',
    'build.log', 'browser-before.log', 'browser-after.log', 'mcp.json',
    'mcp-server.log', 'mcp-console.log', 'current-runs.json', 'ci-jobs.json',
    'parent-ci.json', 'reference-tests.mjs', 'reference-prs.json', 'reference-pr76.json', 'reference-pr123.json', 'related-prs.json',
]]
names += [
    'js/src/automation/question-match.js', 'js/src/automation/question-subjects.js',
    'js/tests/question-subjects.test.js', 'js/tests/helpers/e2e-form-subjects.mjs',
    'js/tests/e2e-forms-reader-browser.mjs', 'experiments/issue-56/forms-subject-fixture.mjs',
    'experiments/issue-56/forms-reader-fixture.mjs', 'experiments/issue-56/forms-reader-ui.mjs',
    'experiments/issue-56/forms-subject-mcp.mjs', 'experiments/issue-56/collect-forms-subjects.py',
    'docs/case-studies/issue-56/forms-subjects.md',
    'ci-logs/forms-timezone-reference-requirements.md', 'ci-logs/forms-timezone-reference-head.json',
]
metadata = {
    'date': '2026-11-11', 'preceding_head': '5d0f67b00ceb9d57c3aed7c0d77b68a12e41d82d',
    'node_checks': 33, 'deno_tests': 33, 'browser': browser, 'mcp': mcp, 'actual_values': server,
    'remaining': 'Broader rewording similarity, complete form/provider parity and every unchecked issue criterion remain required.',
}
bundle(root, names, 'docs/case-studies/issue-56/data/forms-subjects.tar.gz',
       metadata, 'issue-56-forms-subjects-*.png', before={'js/src/automation/question-match.js': '5d0f67b0'})
