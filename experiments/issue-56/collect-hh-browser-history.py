"""Preserve the actual-parent HH browser-history regressions and final checks."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name, marker in {
    'node-before': 'fail 1',
    'node-after': 'pass 62',
    'deno': '62 passed | 0 failed',
    'browser-after': '"cases":5',
    'browser-compatibility': '"cases":25',
}.items():
    assert marker in (logs / f'hh-browser-history-{name}.log').read_text(), name
assert (logs / 'hh-browser-history-browser-before.log').read_text().count('[hh-choices] FAIL') == 5
assert not (logs / 'hh-browser-history-lint.log').read_text().strip()
mcp = json.loads((logs / 'hh-browser-history-mcp.json').read_text())
result = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result['draftPreserved'] and result['readOnlyDraftPreserved']
assert result['clicks'] == result['text'] == 0 and not result['liveProvider']

sources = [f'js/src/sources/{name}.js' for name in (
    'browser-choice-reader', 'browser-choice-controller', 'browser-choices',
    'browser-sender', 'hh-web-ui')]
files = [
    *sources,
    'js/tests/hh-browser-history.test.js', 'js/tests/browser-sender.test.js',
    'js/tests/helpers/e2e-hh-browser-history.mjs',
    'js/tests/helpers/e2e-hh-choices.mjs',
    'experiments/issue-56/hh-choices-browser.mjs',
    'experiments/issue-56/hh-choices-mcp-server.mjs',
    'experiments/issue-56/hh-choice-fixture.mjs',
    'experiments/issue-56/provider-choice-fixture.mjs',
    'experiments/issue-56/collect-hh-browser-history.py',
    'experiments/issue-56/hh-browser-history-before.py',
    'experiments/issue-56/hh-browser-history-mcp.mjs',
    'docs/case-studies/issue-56/hh-browser-history.md',
    'ci-logs/hh-browser-history-mcp.json',
    'ci-logs/hh-chat-scan-parent-webkit-130487773262.log',
    'ci-logs/hh-chat-scan-parent-pipeline-130499576408.log',
    'ci-logs/hh-chat-scan-parent-outcome.json',
    *[str(path.relative_to(root)) for path in logs.glob('hh-browser-history-*.log')],
]
bundle(root, files, 'docs/case-studies/issue-56/data/hh-browser-history.tar.gz', {
    'parent': '50021c333fb066a21a19de03c523529ad662a958',
    'before_node_fail': 1, 'before_browser_fail': 5,
    'node_pass': 62, 'deno_pass': 62, 'browser_cases': 25,
    'mcp': result, 'live_provider': False,
    'remaining': 'Unread orchestration and policies, hosted timeout investigation, exact-head CI and all unchecked issue requirements.',
}, 'issue-56-hh-browser-history/*.png', before=dict.fromkeys(sources, '50021c33'))
