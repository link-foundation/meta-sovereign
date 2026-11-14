"""Retain native focus launch failures, two-tab observations and bounded checks."""
import json
import re
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '64627d7d'
read = lambda name: (root / f'ci-logs/inactive-focus-{name}.log').read_text()
assert 'Actual parent headless shell refuses' in read('history-before')
assert 'browser-background-owner-active' in read('history-before')
assert '/fixture/full-chromium' in read('runner-before')
shell = json.loads(read('shell').strip())
chrome = json.loads(read('chrome').strip())
assert all(shell[phase]['focused'] for phase in ('original', 'background', 'returned'))
assert chrome['original']['focused'] and chrome['returned']['focused']
assert not chrome['background']['focused']
assert 'phase":"passed"' in read('history-after')
assert '[e2e-question-inactive-history] OK (chromium)' in read('history-after')
assert 'pass 22' in read('node') and 'fail 0' in read('node')
assert '1 passed | 0 failed' in read('deno')
assert not read('lint') and not read('secrets')
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
columns = [part.strip() for part in next(
    line for line in duplication.splitlines() if 'Total:' in line).split('│') if part.strip()]
assert int(columns[5].split()[0]) / int(columns[2]) * 100 <= 6.5
bundle(root, [
    *changed_sources(root, parent), *evidence_logs(root, 'inactive-focus'),
    'ci-logs/clink-cleanup-parent-chromium-130772386582.log',
], 'docs/case-studies/issue-56/data/ci-native-focus.tar.gz', {
    'parent': parent, 'hosted_parent': 'b73f3433dc050922b0747d0fe4f8f52eba1f8e26',
    'actual_parent_failures': 2, 'node_checks': 22, 'deno_checks': 1,
    'native_history_cases': 8, 'local_shell_major': 158, 'local_full_browser_major': 155,
    'remaining': 'Exact-head full Chromium CI, Windows preparation, original macOS assertion and every unchecked product criterion.',
}, 'issue-56-ci-native-focus/*.png', before={
    'js/tests/helpers/e2e-browser-scenarios.mjs': parent,
    'js/tests/e2e-question-inactive-history-browser.mjs': parent,
})
