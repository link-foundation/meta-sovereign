"""Preserve bounded review-journal regressions and focused verification."""
from pathlib import Path
from evidence_bundle import write_entries_archive
import hashlib
import json

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 37' in (logs / 'forms-journal-node.log').read_text()
assert '10 passed | 0 failed' in (logs / 'forms-journal-deno.log').read_text()
assert 'pass 4' in (logs / 'forms-journal-json-compat-node.log').read_text()
assert '4 passed | 0 failed' in (logs / 'forms-journal-json-compat-deno.log').read_text()
assert 'OK (chromium)' in (logs / 'forms-journal-browser.log').read_text()
assert 'historyReview is not a function' in (logs / 'forms-journal-node-before.log').read_text()
assert 'captured pages are available' in (logs / 'forms-journal-browser-before.log').read_text()
assert not (logs / 'forms-journal-final-lint.log').read_text().strip()
assert '34740 (6.49%)' in (logs / 'forms-journal-duplication.log').read_text()
mcp = json.loads((logs / 'forms-journal-mcp.json').read_text())
assert mcp['checkpoints'] == 3 and mcp['originalValuePreserved']
assert mcp['applyButtons'] == mcp['fillSelections'] == mcp['tutorialOverlays'] == 0
assert mcp['viewport'] == mcp['contentWidth'] == 390
cleanup = json.loads((logs / 'forms-journal-mcp-cleanup.json').read_text())
assert cleanup['submissions'] == 0
assert all(read['closed'] and not read['events'] for read in cleanup['reads'])
excluded = ('-archive.log', '-commit.log', '-push.log', '-pr.log')
names = [str(p.relative_to(root)) for p in logs.glob('forms-journal-*')
         if p.is_file() and not p.name.endswith(excluded)]
names += [str(p.relative_to(root)) for p in (root / 'js/src/forms').glob('report-*.js')]
names += ['js/src/forms/review-journal.js', 'js/src/forms/review-sessions.js',
          'js/src/forms/reader.js', 'js/src/web/form-review-journal.js',
          'js/src/web/form-report-download.js', 'js/src/cli/forms-review-commands.js',
          'js/src/cli/forms-commands.js', 'js/tests/forms-journal.test.js',
          'js/tests/forms-markdown.test.js', 'js/tests/helpers/e2e-form-journal.mjs',
          'experiments/issue-56/forms-journal-before.py',
          'experiments/issue-56/collect-forms-journal.py',
          'ci-logs/broken-links-42864298263.log']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps({
    'date': '2026-11-10', 'preceding_head': '1d0526a9d8542a09619a94ee1590ae3866628882',
    'node_checks': 37, 'deno_checks': 10, 'final_markdown_compatibility': '4 Node / 4 Deno',
    'browser': 'production Chromium; independent MCP desktop / 390-pixel mobile',
    'duplication': '34740/535338 lines (6.49%); unchanged 6.5% gate',
    'hosted': 'preceding macOS Deno runner not acquired; Google Contacts HTTP 429; new head required',
    'limits': 'explicit checkpoints only; automatic capture and learning remain required',
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-journal-*.png'))},
}, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-review-journal.tar.gz'
write_entries_archive(archive, entries)
