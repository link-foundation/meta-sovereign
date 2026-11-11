"""Preserve exact summary-choice regressions, CI failures and browser evidence."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 74' in (root / 'ci-logs/summary-choice-focused.log').read_text()
assert '16 passed | 0 failed' in (root / 'ci-logs/summary-choice-deno.log').read_text()
assert '"cases":3' in (root / 'ci-logs/summary-choice-ui.log').read_text()
assert 'acceptedSummaryMissing' in (root / 'ci-logs/summary-choice-parent-node.log').read_text()
assert 'conflictProtected' in (root / 'ci-logs/summary-choice-mcp.json').read_text()
shots = sorted((root / 'docs/screenshots/issue-56-summary-choice').rglob('*.png'))
assert len(shots) == 8, len(shots)
assert all(path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') for path in shots)
paths = json.loads((root / 'ci-logs/summary-choice-changed-files.json').read_text())
logs = [str(path.relative_to(root)) for path in (root / 'ci-logs').glob('summary-choice-*') if path.suffix in ['.log', '.json']]
logs += [str(path.relative_to(root)) for path in (root / 'ci-logs').glob('question-browser-error-*') if path.suffix in ['.log', '.json']]
logs += ['ci-logs/shared-browser-security-42993595060.log', 'ci-logs/shared-browser-checks-42993594792.log']
bundle(root, [
    *paths, *logs, *[str(path.relative_to(root)) for path in shots],
    'experiments/issue-56/collect-summary-choice.py',
], 'docs/case-studies/issue-56/data/summary-choice.tar.gz', {
    'parent': '7e0e2f4d9f5ff4b1a279029b31348dbe87031f0f',
    'focused_node_pass': 74, 'focused_deno_pass': 16,
    'production_chromium_cases': 3, 'independent_mcp': 'desktop, phone receipt, conflict refusal',
    'screenshots_count': len(shots), 'live_provider': False,
    'remaining': 'Assignment stdin CI race, automatic provider watchers, live provider parity and every unchecked issue criterion.',
}, 'issue-56-summary-choice/**/*.png', before={name: '7e0e2f4d' for name in [
    'js/src/automation/question-answers.js', 'js/src/automation/question-store.js',
    'js/src/automation/planning-store.js', 'js/src/cli/question-commands.js',
    'experiments/issue-56/question-browser-server.mjs',
]})
