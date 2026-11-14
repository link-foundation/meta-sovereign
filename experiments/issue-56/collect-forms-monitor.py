"""Preserve finite passive-capture regressions and focused browser evidence."""
from pathlib import Path
from evidence_bundle import write_entries_archive
import hashlib
import json

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 28' in (logs / 'forms-monitor-node.log').read_text()
assert '9 passed | 0 failed' in (logs / 'forms-monitor-deno.log').read_text()
for name in ('browser', 'download-browser', 'journal-browser'):
    assert 'OK (chromium)' in (logs / f'forms-monitor-{name}.log').read_text()
assert 'Confirmed lost owner edit' in (logs / 'forms-monitor-before.log').read_text()
assert 'rapid Next retains the previous page owner answer' in (logs / 'forms-monitor-browser-before.log').read_text()
assert 'download exports the actual proposal' in (logs / 'forms-monitor-download-before.log').read_text()
assert not (logs / 'forms-monitor-lint.log').read_text().strip()
assert '34826 (6.49%)' in (logs / 'forms-monitor-duplication.log').read_text()
mcp = json.loads((logs / 'forms-monitor-mcp.json').read_text())
assert mcp['first']['firstPageAnswerPreserved'] and mcp['first']['nextHint']
assert mcp['first']['passwordOmitted'] and mcp['first']['autoCapture']
assert mcp['first']['checkpoints'] == 6
assert mcp['second']['secondPageAnswerPreserved']
assert not mcp['second']['nextHint']
assert mcp['second']['viewport'] == mcp['second']['contentWidth'] == 390
for state in mcp.values():
    assert state['fillSelections'] == state['applyButtons'] == state['tutorialOverlays'] == 0
fixture = [json.loads(line) for line in (logs / 'forms-monitor-mcp-fixture.log').read_text().splitlines()]
assert fixture[1]['rulesUnchanged'] and fixture[1]['submissions'] == 0
assert fixture[-1]['submissions'] == 0
assert all(read['closed'] for read in fixture[-1]['reads'])
excluded = ('-archive.log', '-commit.log', '-push.log', '-pr.log')
names = [str(p.relative_to(root)) for p in logs.glob('forms-monitor-*')
         if p.is_file() and not p.name.endswith(excluded)]
names += [
    'js/src/forms/monitor-document.js', 'js/src/forms/review-monitor.js',
    'js/src/forms/review-sessions.js', 'js/src/forms/review-lifecycle.js',
    'js/src/forms/read-document.js', 'js/src/web/form-monitor-status.js',
    'js/src/web/form-report-download.js', 'js/src/web/form-review-controls.js',
    'js/src/cli/forms-review-commands.js', 'js/tests/forms-monitor.test.js',
    'js/tests/forms-monitor-document.test.js', 'js/tests/helpers/e2e-form-monitor.mjs',
    'experiments/issue-56/forms-monitor-before.py',
    'experiments/issue-56/forms-monitor-fixture.mjs',
    'experiments/issue-56/forms-monitor-control.mjs',
    'experiments/issue-56/collect-forms-monitor.py',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps({
    'date': '2026-11-10', 'preceding_head': '2e1d1c9fb7817d6bc0f17b8623725caa181f41b2',
    'node_checks': 28, 'deno_checks': 9,
    'browser': 'focused automatic capture, manual journal and original plan/download Chromium; independent MCP desktop/mobile',
    'duplication': '34826/536699 lines (6.49%); unchanged 6.5% gate',
    'hosted': 'preceding Checks fails original filename assertion in both browsers; compatibility restored; new-head matrix required',
    'limits': 'bounded passive captures only; detached watchers and confirmed/stable-edit learning remain required',
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-monitor-*.png'))},
}, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-automatic-capture.tar.gz'
write_entries_archive(archive, entries)
