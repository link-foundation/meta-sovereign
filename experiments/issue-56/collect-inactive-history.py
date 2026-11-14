"""Preserve real-focus admission, delayed-scroll regressions and MCP evidence."""
import json
from pathlib import Path
import re
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '41fd7342d7372119f07dea12634311709dd77c41'
read = lambda name: (root / f'ci-logs/inactive-history-{name}.log').read_text()
for name in ('watch', 'scroll'):
    assert f'Expected {name} parent regression: exit 1' in read(f'before-{name}')
assert "+ 'undefined'" in read('before-watch')
assert '"reason":"read-failed","passes":0' in read('before-scroll')
assert 'verifyScrollSettlement' in read('before-scroll')
assert 'pass 90' in read('focused-final') and 'fail 0' in read('focused-final')
native = json.loads(read('final-browser').splitlines()[-1])
assert native['cases'] == 8 and native['focusMode'] == 'native'
assert not native['liveProvider']
compatibility = json.loads(read('compatibility').splitlines()[-1])
assert compatibility['history']['cases'] == 16
assert compatibility['lists']['cases'] == 12
assert all(not read(name) for name in ('lint', 'secrets', 'syntax'))
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
columns = [column.strip() for column in total.split('│') if column.strip()]
assert 'ERROR' not in duplication
assert int(columns[5].split()[0]) / int(columns[2]) * 100 <= 6.5
mcp = json.loads((root / 'ci-logs/inactive-history-mcp-result.json').read_text())
assert mcp['cases'] == 3 and mcp['released'] == 1
assert not mcp['pageErrors'] and not mcp['liveProvider']
assert mcp['outcomes'][1]['coverage']['complete']
assert mcp['outcomes'][1]['restored']
assert [item['owner']['top'] for item in mcp['outcomes'][1:]] == [300, 980]
assert all(not item['owner']['sends'] and not item['owner']['lease']
           and not item['owner']['history'] for item in mcp['outcomes'][1:])
bundle(root, [
    *changed_sources(root, parent), *evidence_logs(root, 'inactive-history'),
    'ci-logs/inactive-history-mcp-code.js',
    'ci-logs/question-background-parent-webkit-130725304728.log',
    'ci-logs/hh-unread-reference/background-rejections.mjs',
    'experiments/issue-56/question-browser-probe.mjs',
    'experiments/issue-56/conversation-history-fixture.mjs',
    'experiments/issue-56/hh-chat-scan-fixture.mjs',
    'js/tests/helpers/e2e-hh-chat-scan.mjs',
    'js/tests/helpers/e2e-conversation-history.mjs',
], 'docs/case-studies/issue-56/data/inactive-history.tar.gz', {
    'parent': parent, 'actual_parent_failures': 2, 'node_checks': 90,
    'native_chromium_cases': 8, 'compatibility_cases': 28, 'mcp': mcp,
    'remaining': 'Hosted CI corrections and exact-head checks, background delivery, cross-chat/filter restoration, unread orchestration, public controls, live providers and every unchecked issue criterion.',
}, 'issue-56-inactive-history/*.png', before={
    f'js/src/sources/{name}.js': parent for name in (
        'browser-answer-watch', 'browser-chat-list-state')
})
