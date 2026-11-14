"""Retain exact hosted failures, six parent regressions and focused corrections."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '2efd33cda8a30457f8b4d40f1a15af8813682bea'
read = lambda name: (root / f'ci-logs/windows-cli-{name}.log').read_text()
assert 'fail 6' in read('before')
assert 'working sources restored' in read('before-summary')
assert 'pass 18' in read('node') and 'fail 0' in read('node')
assert 'pass 1' in read('question-registry')
assert '11 passed | 0 failed | 2 ignored' in read('deno')
assert '5 passed | 0 failed' in read('deno-ci')
assert '1 passed | 0 failed' in read('deno-registry')
assert '6 pass' in read('bun') and '0 fail' in read('bun')
browser = read('browser')
assert 'SKIP:' not in browser and '[e2e-question-notice-policy] OK (chromium)' in browser
assert browser.count('[notice-policy] PASS ') == 7
assert '"phase":"passed"' in browser
for name in ['lint', 'secrets']:
    assert not read(name).strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'ERROR' not in read('duplication')
before, after = [json.loads((root / f'ci-logs/windows-cli-version-{state}.json').read_text())
                 for state in ['before', 'after']]
assert before['moduleCount'] == 627 and after['moduleCount'] == 8
assert after['codes'] == [0, 0, 0] and len(set(after['output'])) == 1
assert not [name for name in after['modules'] if name.startswith('sources/')]
bundle(root, [
    *changed_sources(root, parent), *evidence_logs(root, 'windows-cli'),
    *[f'ci-logs/notice-policy-windows-{job}.log' for job in [
        130791973065, 130791973139, 130791973175]],
    'ci-logs/notice-policy-pipeline-130805035257.log',
    'ci-logs/notice-policy-runs.json',
], 'docs/case-studies/issue-56/data/ci-windows-cli.tar.gz', {
    'parent': parent, 'before_regressions': 6,
    'node_checks': 19, 'deno_checks': 17, 'deno_node_hooks_ignored': 2,
    'bun_checks': 6, 'native_browser_cases': 7, 'production_ui_cases': 4,
    'version_before': {key: before[key] for key in ['moduleCount', 'elapsedMs', 'maxRssKiB']},
    'version_after': {key: after[key] for key in ['moduleCount', 'elapsedMs', 'maxRssKiB']},
    'timeout_cause': 'Not established; version import work removed and opt-in phase diagnostics retained.',
    'remaining': 'Hosted Windows/CodeQL/browser confirmation and every unchecked product requirement.',
}, 'no-ci-windows-cli-screenshot', before={
    name: parent for name in ['js/src/cli/index.js', 'js/src/cli/commands.js',
                             'experiments/issue-56/clink-failure-cleanup.mjs',
                             'experiments/issue-56/notice-policy-mcp.mjs', 'package.json']
})
