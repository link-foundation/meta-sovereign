"""Freeze shared browser-answer regressions, recovery evidence and screenshots."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 78' in (root / 'ci-logs/question-browser-focused-node.log').read_text()
assert '"cases":10' in (root / 'ci-logs/question-browser-chromium.log').read_text()
assert 'Expected parent CLI, Lino route and browser controls regression confirmed.' in (root / 'ci-logs/question-browser-before.log').read_text()
assert 'recoveredWithoutReplay' in (root / 'ci-logs/question-browser-mcp.json').read_text()
shots = sorted((root / 'docs/screenshots/issue-56-question-browser').rglob('*.png'))
assert len(shots) == 14, len(shots)
assert all(path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') for path in shots)
paths = json.loads((root / 'ci-logs/question-browser-changed-files.json').read_text())
logs = [str(path.relative_to(root)) for path in (root / 'ci-logs').glob('question-browser-*') if path.suffix in ['.log', '.json']]
bundle(root, [
    *paths, *logs, *[str(path.relative_to(root)) for path in shots],
    'docs/case-studies/issue-56/README.md',
    'experiments/issue-56/question-browser-before.py',
    'experiments/issue-56/collect-question-browser.py',
], 'docs/case-studies/issue-56/data/question-browser.tar.gz', {
    'parent': '9d31e561d0028822654bd9cf220a236d1178f4e4',
    'focused_node_pass': 78, 'production_chromium_cases': 10,
    'independent_mcp': 'desktop/mobile receipt recovery and owner protection',
    'live_provider': False, 'screenshots_count': len(shots),
    'remaining': 'Completed-summary option recovery, provider watchers and every unchecked issue criterion.',
}, 'issue-56-question-browser/**/*.png', before={name: '9d31e561' for name in [
    'js/src/cli/question-commands.js', 'js/src/server/routes-question-answers.js',
    'js/src/web/question-controls.js', 'js/src/web/chat-view.js', 'js/src/web/question-api.js',
]})
