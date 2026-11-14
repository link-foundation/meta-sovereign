"""Preserve bounded owned-form learning regressions and browser evidence."""
from pathlib import Path
from evidence_bundle import write_entries_archive
import hashlib
import json

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 39' in (logs / 'forms-learning-node.log').read_text()
assert '18 passed | 0 failed' in (logs / 'forms-learning-deno.log').read_text()
assert 'OK (chromium)' in (logs / 'forms-learning-browser-after.log').read_text()
assert 'baseline lacks stable owner edit and submitted answer learning' in (
    logs / 'forms-learning-browser-before.log').read_text()
assert not (logs / 'forms-learning-lint-current.log').read_text().strip()
mcp = json.loads((logs / 'forms-learning-mcp.json').read_text())
assert '2 proposals saved' in mcp['learning']
assert '0 omitted' in mcp['learning'] and '0 failures' in mcp['learning']
assert mcp['actualQuestions'] == ['Company context', 'Availability notes']
assert len(mcp['actualAnswers']) == 2
assert mcp['viewport'] == mcp['contentWidth'] == 390
assert mcp['tutorialOverlays'] == 0
fixture = [json.loads(line) for line in
           (logs / 'forms-learning-mcp-fixture.log').read_text().splitlines()]
stable = next(state for state in fixture if state.get('action') == 'state')
assert stable['submissions'] == 0
assert any(rule['question'] == 'Company context' for rule in stable['rules'])
completed = [state for state in fixture if state.get('action') == 'state'][-1]
learned = [rule for rule in completed['rules'] if rule['question'] in
           ('Company context', 'Availability notes')]
assert len(learned) == 2
assert all(not answer['approved'] and answer['count'] == 1
           for rule in learned for answer in rule['answers'])
assert fixture[-1]['submissions'] == 1
assert all(read['closed'] for read in fixture[-1]['reads'])
assert sum(request['method'] == 'POST' for request in fixture[-1]['requests']) == 1
parent = json.loads((logs / 'forms-learning-parent-checks-status.json').read_text())
assert parent['headSha'] == '321058d3aeddb4d4e94348aaf9b6fcf926ee0487'
assert parent['conclusion'] == 'success'
excluded = ('-archive.log', '-commit.log', '-push.log', '-pr.log')
names = [str(p.relative_to(root)) for p in logs.glob('forms-learning-*')
         if p.is_file() and not p.name.endswith(excluded)]
names += [
    'js/src/automation/question-learning.js', 'js/src/automation/question-merge.js',
    'js/src/automation/question-store.js', 'js/src/forms/answer-learning.js',
    'js/src/forms/answer-pairs.js', 'js/src/forms/monitor-learning-document.js',
    'js/src/forms/review-learning.js', 'js/src/forms/monitor-document.js',
    'js/src/forms/review-monitor.js', 'js/src/forms/review-sessions.js',
    'js/src/forms/review-lifecycle.js', 'js/src/forms/report-markdown.js',
    'js/src/web/form-learning-status.js', 'js/src/web/form-review-controls.js',
    'js/src/web/form-review-journal.js', 'js/src/cli/forms-review-commands.js',
    'js/tests/forms-learning.test.js', 'js/tests/forms-learning-document.test.js',
    'js/tests/forms-monitor-document.test.js', 'js/tests/forms-monitor.test.js',
    'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-form-learning.mjs',
    'js/tests/helpers/e2e-form-learning-gestures.mjs',
    'experiments/issue-56/forms-learning-fixture.mjs',
    'experiments/issue-56/forms-monitor-control.mjs',
    'experiments/issue-56/forms-reader-fixture.mjs',
    'experiments/issue-56/forms-reader-ui.mjs',
    'experiments/issue-56/collect-forms-learning.py',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps({
    'date': '2026-11-10',
    'preceding_head': '321058d3aeddb4d4e94348aaf9b6fcf926ee0487',
    'node_checks': 39, 'deno_checks': 18,
    'browser': 'focused production Chromium including native gesture trust; independent MCP desktop/mobile',
    'stability_ms': {'production': 60000, 'bounded_browser_fixture': 800},
    'hosted': 'all five preceding-head workflows pass; new-head matrix required',
    'limits': 'owned review lifetime only; detached per-slot watchers and other unchecked issue scope remain required',
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-learning-*.png'))},
}, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-answer-learning.tar.gz'
write_entries_archive(archive, entries)
