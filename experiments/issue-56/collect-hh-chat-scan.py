"""Archive the finite virtual-list contract and actual-parent reproduction."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
checks = {
    'before-node': 'fail 5',
    'node': 'pass 76',
    'deno': '76 passed | 0 failed',
    'root-before': "'98'",
}
for name, expected in checks.items():
    assert expected in (logs / f'hh-chat-scan-{name}.log').read_text(), name
browser = json.loads((logs / 'hh-chat-scan-ui.log').read_text())
assert browser['cases'] == 12 and not browser['liveProvider']

before_sources = [f'js/src/sources/{name}.js' for name in (
    'browser-actions', 'browser-sender', 'browser-choice-document', 'hh-web-ui')]
current_sources = [*before_sources, *[
    str(path.relative_to(root)) for path in (root / 'js/src/sources').glob('browser-chat-*.js')]]
evidence = [
    *current_sources,
    *[f'js/tests/{name}.test.js' for name in (
        'hh-chat-list', 'hh-chat-scan', 'hh-chat-scan-sender')],
    'js/tests/helpers/e2e-hh-chat-scan.mjs', 'js/tests/e2e-questions-browser.mjs',
    'docs/case-studies/issue-56/hh-chat-scan.md',
    'experiments/issue-56/collect-hh-chat-scan.py',
    *[str(path.relative_to(root)) for folder, pattern in (
        (root / 'experiments/issue-56', 'hh-chat-scan-*'),
        (logs, 'hh-chat-scan-*.log')) for path in folder.glob(pattern)],
    'ci-logs/hh-chat-scan-mcp.json',
]
bundle(root, evidence, 'docs/case-studies/issue-56/data/hh-chat-scan.tar.gz', {
    'parent': '1fb190ca176519da8fb2a365bf52cc2e33c7994b',
    'before_fail': 5, 'focused_node_pass': 76, 'focused_deno_pass': 76,
    'browser_cases': browser['outcomes'], 'live_provider': False,
    'coverage': 'Observed rendered list only; provider completeness remains false.',
    'remaining': 'All-unread orchestration and controls, acknowledgement/rejection policies, live provider verification and all unchecked criteria.',
}, 'issue-56-hh-chat-scan/*.png', before=dict.fromkeys(before_sources, '1fb190ca'))
