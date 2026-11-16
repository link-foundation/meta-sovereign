"""Retain observed UI control, parent regression and independent browser proof."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 30' in (logs / 'runner-ui-ready-node.log').read_text()
assert 'fail 0' in (logs / 'runner-ui-ready-node.log').read_text()
assert '5 passed | 0 failed' in (logs / 'runner-ui-ready-deno.log').read_text()
assert not (logs / 'runner-ui-ready-lint.log').read_text().strip()
assert not (logs / 'runner-ui-ready-diff.log').read_text().strip()
assert json.loads((logs / 'runner-ui-parent.log').read_text())['regressionFails']
assert json.loads((logs / 'runner-ui-before.log').read_text())['missingRunnerControls']
native = json.loads((logs / 'runner-ui-browser.log').read_text())
assert native['bothSwitchDirections'] and native['ambiguousActionNotReplayed']
assert native['unknownStateBlocksSwitch'] and native['desktopAndPhoneFit']
inspection = json.loads((logs / 'runner-ui-mcp-result.json').read_text())
result = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in result['result']] == ['en', 'ru', 'zh', 'hi']
assert all(item['translated'] and item['observedSwitch'] and item['desktopAndPhoneFit']
           for item in result['result'])
assert result['pageErrors'] == 0 and result['liveProvider'] is False
closed = json.loads((logs / 'runner-ui-mcp-server.log').read_text().splitlines()[-1])
assert closed['resourcesClosed'] and closed['liveProvider'] is False
assert closed['mutations'] == [['local', 'start'], ['local', 'stop'],
                               ['server', 'start'], ['server', 'stop']] * 4
names = [
    'js/src/web/dom.js', 'js/src/web/settings-view.js',
    'js/src/web/runner-api.js', 'js/src/web/runner-view-state.js',
    'js/src/web/settings-runner.js', 'js/src/web/locales/index.js',
    'js/src/web/locales/runner.js', 'js/src/transport/runner-receipt.js',
    'js/tests/runner-view.test.js', 'js/tests/e2e-vk-token-browser.mjs',
    'js/tests/helpers/e2e-runner-sessions.mjs',
    'experiments/issue-56/runner-api-fixture.mjs',
    'experiments/issue-56/runner-fixture.mjs',
    'experiments/issue-56/runner-ui-before.mjs',
    'experiments/issue-56/runner-ui-check.mjs',
    'experiments/issue-56/runner-ui-parent.mjs',
    'experiments/issue-56/runner-ui-mcp.mjs',
    'experiments/issue-56/runner-ui-mcp-server.mjs',
    'experiments/issue-56/collect-runner-session-controls.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/DESKTOP-RUNNER.md', '.changeset/visible-browser-defaults.md',
    'docs/case-studies/issue-56/runner-session-controls.md',
    *[f'ci-logs/{name}' for name in (
        'runner-ui-parent.log', 'runner-ui-before.log', 'runner-ui-browser.log',
        'runner-ui-ready-node.log', 'runner-ui-ready-deno.log',
        'runner-ui-ready-lint.log', 'runner-ui-ready-format-check.log',
        'runner-ui-ready-diff.log', 'runner-ui-mcp-result.json',
        'runner-ui-mcp-server.log', 'runner-ui-mcp-console.log',
        'runner-ui-runs.json',
    )],
]
entries = {name: (root / name).read_bytes() for name in names}
parent = 'aa897f694df94471bb6fa713c5b1733397985b5b'
for name in ['js/src/web/dom.js', 'js/src/web/settings-view.js',
             'js/src/web/locales/index.js']:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False, 'remaining_rows': 60,
    'acceptance_rows_completed': [], 'parent': parent,
    'focused_checks': {'node': 30, 'deno': 5},
    'native': native, 'independent_mcp': result,
    'hosted_acceptance': 'pending',
    'scope': 'isolated-session',
    'screenshots': {
        str(image.relative_to(root)): hashlib.sha256(image.read_bytes()).hexdigest()
        for image in sorted((root / 'docs/screenshots').glob('issue-56-runner-*.png'))
    },
    'console_limits': 'disabled Telegram fixture routes return 404; MCP Chromium cache-write errors retained',
    'preparation_profile_editing_independent_desktop_ownership': 'unfinished',
}, indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/runner-session-controls.tar.gz', entries)
