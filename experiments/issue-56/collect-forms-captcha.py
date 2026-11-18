"""Preserve bounded manual-verification checks and actual browser observations."""
import json
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/forms-captcha-'
expected = {
    'before.log': 'fail 1',
    'browser-before.log': 'challenge excluded from public answers',
    'node.log': 'pass 63',
    'deno.log': '63 passed | 0 failed',
    'ci-node.log': 'pass 17',
    'ci-deno.log': '17 passed | 0 failed',
    'groups-before.log': 'group:undefined',
    'browser.log': 'OK (chromium)',
    'answers-browser.log': 'OK (chromium)',
    'format-check.log': 'All matched files use Prettier code style!',
}
for suffix, text in expected.items():
    assert text in Path(f'{prefix}{suffix}').read_text(), suffix
assert not Path(f'{prefix}lint.log').read_text().strip()
assert 'ERROR: jscpd' not in Path(f'{prefix}duplication.log').read_text()
assert '"lostResponseRecovered":true' in Path(f'{prefix}browser.log').read_text()
proof = json.loads(Path(f'{prefix}mcp.json').read_text())
assert proof['waiting'] == {'state': 'waiting-owner', 'closeEnabled': True,
                            'ownerActionRequired': True}
assert proof['completed'] == {'state': 'prefilled', 'complete': True,
                              'receipts': 1, 'submissionAttempted': False,
                              'closed': True}
actual = json.loads(Path(f'{prefix}mcp-server.log').read_text().splitlines()[-1])
assert actual['submissions'] == 0 and len(actual['reads']) == 1
owned = actual['reads'][0]
assert owned['closed'] and owned['events'] == [{'name': 'input', 'target': 'email'}]
assert owned['captcha'] == {'challengeReads': 0, 'ownerReleases': 1,
                            'email': 'ada@example.test'}
sources = Path(f'{prefix}changed-js.txt').read_text().splitlines()
sources += [f'ci-logs/forms-captcha-{suffix}' for suffix in [
    *expected, 'lint.log', 'build.log', 'duplication.log', 'mcp.json',
    'mcp-server.log', 'parent-ci.json', 'parent-ci-failure.json',
]]
sources += ['ci-logs/checks-42947012763.log', 'package.json',
            'js/scripts/browser-checks.json',
            'experiments/issue-56/verify-forms-captcha-before.py',
            'experiments/issue-56/verify-forms-groups-before.py',
            'experiments/issue-56/collect-forms-captcha.py',
            'docs/case-studies/issue-56/forms-captcha.md']
parent = 'ee447589d14829aacd692cb0a9e7d98f17479723'
bundle(root, sources, 'docs/case-studies/issue-56/data/forms-captcha.tar.gz',
       {'date': '2026-11-11', 'preceding_head': parent,
        'node': 80, 'deno': 80, 'mcp': proof, 'actual': actual,
        'remaining': 'Live challenge/provider parity, assignments, discovery, chat/model automation and every unchecked issue criterion.'},
       'issue-56-forms-captcha-*.png', before={
           'js/src/forms/automatic-prefill.js': parent,
           'js/src/forms/read-document.js': parent,
           'js/scripts/run-browser-checks.mjs': parent})
