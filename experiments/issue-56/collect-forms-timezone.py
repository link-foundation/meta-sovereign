"""Archive finite city/time-zone regressions and exact browser readback evidence."""
import json
from evidence_bundle import bundle
from pathlib import Path

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 5' in (logs / 'forms-timezone-before.log').read_text()
assert 'pass 37' in (logs / 'forms-timezone-after.log').read_text()
assert '37 passed | 0 failed' in (logs / 'forms-timezone-deno.log').read_text()
assert 'Moscow-offset request includes configured city and time zone' in (logs / 'forms-timezone-browser-before.log').read_text()
assert not (logs / 'forms-timezone-final-lint.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (logs / 'forms-timezone-final-format.log').read_text()
browser_log = (logs / 'forms-timezone-browser-after.log').read_text()
assert 'OK (chromium)' in browser_log
browser = json.loads(next(line.split('] ', 1)[1] for line in browser_log.splitlines() if line.startswith('[forms-timezone]')))
combined = 'Нячанг, Вьетнам, UTC+7, МСК+4'
expected_values = {
    'cityMsk': combined, 'cityUtc': combined, 'zoneOnly': 'UTC+7, МСК+4',
    'cityOnly': 'Нячанг, Вьетнам', 'ownerCity': 'Owner keeps this city', 'technical': '',
}
assert browser == dict(values=expected_values, receipts=4, closed=True, submits=0)
mcp = json.loads((logs / 'forms-timezone-mcp.json').read_text())
assert mcp['receipts'] == 4 and mcp['reviewClosed'] and not mcp['phoneOverflow']
for actual, expected in zip(mcp['proposals'], [combined, combined, 'UTC+7, МСК+4', 'Нячанг, Вьетнам'], strict=True):
    assert f'Proposed: {expected}\n' in actual
server = json.loads((logs / 'forms-timezone-mcp-server.log').read_text().splitlines()[-1])
assert server['submissions'] == 0 and len(server['reads']) == 1
assert server['reads'][0]['closed'] and server['reads'][0]['values'] == expected_values

names = [f'ci-logs/forms-timezone-{suffix}' for suffix in [
    'before.log', 'after.log', 'deno.log', 'browser-before.log', 'browser-after.log',
    'final-lint.log', 'final-format.log', 'build.log', 'mcp.json', 'mcp-server.log',
    'mcp-console.log', 'current-runs.json', 'answer-ack-ci.json', 'reference-head.json',
    'reference-prs.json', 'related-prs.json', 'reference-requirements.md',
    'reference-prefill.mjs', 'main-fetch.log',
]]
names += [
    'js/src/forms/profile-fields.js', 'js/src/automation/question-profile-text.js',
    'js/tests/forms-timezone.test.js', 'js/tests/helpers/e2e-form-timezone.mjs',
    'js/tests/e2e-forms-reader-browser.mjs', 'experiments/issue-56/forms-timezone-fixture.mjs',
    'experiments/issue-56/forms-reader-fixture.mjs', 'experiments/issue-56/forms-reader-ui.mjs',
    'experiments/issue-56/forms-timezone-mcp.mjs', 'experiments/issue-56/collect-forms-timezone.py',
    'docs/case-studies/issue-56/forms-timezone.md',
]
metadata = {
    'date': '2026-11-11', 'preceding_head': '75da379be6fa183509fd5fcfe962df88de2a2990',
    'node_checks': 37, 'deno_tests': 37, 'browser': browser, 'mcp': mcp,
    'actual_values': server, 'remaining': 'Automatic source discovery/filling, complete provider parity and every unchecked issue criterion remain required.',
}
bundle(root, names, 'docs/case-studies/issue-56/data/forms-timezone.tar.gz',
       metadata, 'issue-56-forms-timezone-*.png', before={name: '75da379b' for name in ['js/src/forms/profile-fields.js', 'js/src/automation/question-profile-text.js']})
