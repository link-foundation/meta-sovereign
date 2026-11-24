"""Freeze actual failed CI evidence and bounded observer-order regressions."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
for name, expected in [('unit-node', 'pass 3'), ('unit-deno', '3 passed | 0 failed'),
                       ('observer-before', "'warn' !== 'debug'"),
                       ('observer-webkit', '[layout-observer] PASS reading'),
                       ('webkit-after', '[e2e-automation-chat] OK (webkit)')]:
    assert expected in (root / f'ci-logs/layout-{name}.log').read_text()
for name in ['lint', 'secretlint']:
    assert not (root / f'ci-logs/layout-{name}.log').read_text().strip()
assert '\\"pageErrors\\":[]' in (root / 'ci-logs/layout-observer-mcp.json').read_text()
images = sorted((root / 'docs/screenshots/issue-56-layout-observer').rglob('*.png'))
assert len(images) == 11 and len({p.name for p in images}) == 11
source = 'js/src/web/chat-layout-trace.js'
bundle(root, [
    source, 'js/tests/chat-layout-trace.test.js',
    'js/tests/e2e-automation-chat-browser.mjs',
    'js/tests/helpers/e2e-layout-observer.mjs',
    *[str(p.relative_to(root)) for p in (root / 'experiments/issue-56').glob('layout-*') if p.is_file()],
    'experiments/issue-56/collect-layout-observer.py',
    'docs/case-studies/issue-56/ci-layout-observer.md',
    *[f'ci-logs/layout-{name}.log' for name in [
        'unit-node', 'unit-deno', 'observer-before', 'observer-before-summary',
        'observer-webkit', 'webkit-before', 'webkit-traced', 'webkit-after',
        'build', 'lint', 'secretlint', 'format-check', 'duplication', 'mcp-server']],
    'ci-logs/layout-observer-mcp.json', 'ci-logs/layout-ci-runs.json',
    'ci-logs/layout-native-ci-current.json',
    'ci-logs/choice-execution-ci-runs.json', 'ci-logs/choice-execution-ci-current.json',
    'ci-logs/checks-42975700692-full.log',
    'ci-logs/checks-42975700692-webkit-130374999543.log',
    'ci-logs/checks-42975700692-gate-130385040885.log',
    'ci-logs/checks-42975700692-artifacts.json',
    *[str(p.relative_to(root)) for p in images],
], 'docs/case-studies/issue-56/data/layout-observer.tar.gz', {
    'parent': '4da8e6154d5f7ed520986f54a7d1ad4d7cc151d4',
    'failed_ci': 42975700692,
    'before': 'Actual parent React hook fails transient severity in WebKit.',
    'node': 3, 'deno': 3, 'isolated_webkit_cases': 3,
    'production_webkit': 'automation-chat plus observer cases',
    'mcp_cases': 6,
    'remaining': 'Current-head hosted matrix and every unchecked issue criterion.',
}, 'issue-56-layout-observer/**/*.png', before={source: '4da8e615'})
