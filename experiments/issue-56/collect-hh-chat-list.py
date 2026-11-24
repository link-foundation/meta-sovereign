"""Preserve the finite native HH list reproduction and real-browser evidence."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 2' in (logs / 'hh-chat-list-before-node.log').read_text()
assert 'pass 33' in (logs / 'hh-chat-list-node.log').read_text()
assert '33 passed | 0 failed' in (logs / 'hh-chat-list-deno.log').read_text()
assert json.loads((logs / 'hh-chat-list-ui.log').read_text())['cases'] == 2
sources = ['js/src/sources/browser-actions.js', 'js/src/sources/hh-web-ui.js']
bundle(root, [
    *sources, 'js/tests/hh-chat-list.test.js',
    'js/tests/helpers/e2e-hh-chat-list.mjs', 'js/tests/e2e-questions-browser.mjs',
    'docs/case-studies/issue-56/hh-chat-list.md',
    *[str(path.relative_to(root)) for path in (root / 'experiments/issue-56').glob('hh-chat-list-*')],
    'experiments/issue-56/collect-hh-chat-list.py',
    *[str(path.relative_to(root)) for path in logs.glob('hh-chat-list-*.log')],
    'ci-logs/hh-chat-list-mcp.json',
], 'docs/case-studies/issue-56/data/hh-chat-list.tar.gz', {
    'parent': '4ab678393bf276bbb7bff683a38b6b133e1a66a4',
    'focused_node_pass': 33, 'focused_deno_pass': 33,
    'before_fail': 2, 'live_provider': False,
    'remaining': 'Virtual-list traversal, trusted list frames, all-unread orchestration and all unchecked criteria.',
}, 'issue-56-hh-chat-list/*.png', before={name: '4ab67839' for name in sources})
