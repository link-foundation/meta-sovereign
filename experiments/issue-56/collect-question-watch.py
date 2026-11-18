"""Preserve bounded current-chat automation, recovery and browser evidence."""
from pathlib import Path
import hashlib
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 34' in (logs / 'question-watch-node-4.log').read_text()
assert '18 passed | 0 failed' in (logs / 'question-watch-deno-4.log').read_text()
assert 'pass 2' in (logs / 'question-watch-model-compatibility.log').read_text()
assert '"cases":5' in (logs / 'question-watch-ui-5.log').read_text()
assert '20' in (logs / 'question-watch-hh-choices.log').read_text()
assert 'currentChatWatchMissing' in (logs / 'question-watch-before-ui.log').read_text()
mcp = json.loads((logs / 'question-watch-mcp.json').read_text())
assert mcp['cases'] == 2 and not mcp['pageErrors']
assert mcp['clicks'] == mcp['textSends'] == 0
shots = sorted((root / 'docs/screenshots/issue-56-question-watch').rglob('*.png'))
assert len(shots) == 10, len(shots)
assert all(path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') for path in shots)
paths = json.loads((logs / 'question-watch-changed-files.json').read_text())
paths = [name for name in paths
         if not name.endswith(('.min.js', '.pyc')) and '__pycache__' not in name]
records = [str(path.relative_to(root)) for path in logs.glob('question-watch-*')
           if path.suffix in ['.log', '.json', '.png', '.mjs']]
bundle(root, [
    *paths, *records, *[str(path.relative_to(root)) for path in shots],
    'ci-logs/question-watch-final-duplication/jscpd-report.json',
    'experiments/issue-56/collect-question-watch.py',
    'experiments/issue-56/question-browser-server.mjs',
    'experiments/issue-56/question-browser-fixture.mjs',
    'experiments/issue-56/hh-choice-fixture.mjs',
], 'docs/case-studies/issue-56/data/question-watch.tar.gz', {
    'parent': 'ea8d7eae978375b953bf212d364aa645deaae69a',
    'focused_node_pass': 34, 'focused_deno_pass': 18,
    'model_cli_compatibility_pass': 2, 'native_hh_browser_cases': 20,
    'production_chromium_cases': 5, 'independent_mcp': mcp,
    'screenshots_count': len(shots), 'live_provider': False,
    'web_bundle_sha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    'remaining': 'All-unread orchestration, live provider parity and every unchecked issue criterion.',
}, 'issue-56-question-watch/**/*.png', before={name: 'ea8d7eae' for name in [
    'js/src/web/question-browser-controls.js',
    'js/src/web/dom-automation-calls.js',
    'js/src/automation/question-browser.js',
    'js/src/cli/automation-commands.js',
]})
