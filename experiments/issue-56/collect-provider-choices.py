"""Freeze bounded provider-choice regressions and independent browser evidence."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
for name, expected in [('node', 'pass 46'), ('deno', '46 passed | 0 failed'),
                       ('browser', '"cases":20'), ('before-unit', 'fail 2'),
                       ('before-summary', 'browser: parent failed as expected')]:
    assert expected in (root / f'ci-logs/choice-execution-{name}.log').read_text()
for name in ['lint', 'secretlint']:
    assert not (root / f'ci-logs/choice-execution-{name}.log').read_text().strip()
mcp = (root / 'ci-logs/choice-execution-mcp.json').read_text()
assert '\\"pageErrors\\":[]' in mcp and 'mobile' in mcp
images = sorted((root / 'docs/screenshots/issue-56-provider-choices').rglob('*.png'))
assert len(images) == 10 and len({p.name for p in images}) == 10
production = [
    'js/src/sources/browser-sender.js',
    'js/src/sources/browser-choices.js',
    'js/src/sources/browser-choice-controller.js',
    'js/src/sources/browser-choice-reader.js',
]
bundle(root, [
    *production,
    'js/tests/browser-choices.test.js',
    'js/tests/helpers/e2e-provider-choices.mjs',
    'js/tests/e2e-questions-browser.mjs',
    *[str(p.relative_to(root)) for p in (root / 'experiments/issue-56').glob('provider-choice*') if p.is_file()],
    'experiments/issue-56/collect-provider-choices.py',
    'docs/case-studies/issue-56/provider-choices.md',
    'ci-logs/qa-buttons-reference-head.json',
    'ci-logs/qa-buttons-reference-prs.json',
    *[str(p.relative_to(root)) for p in (root / 'ci-logs/qa-buttons-reference').iterdir()],
    *[f'ci-logs/choice-execution-{name}.log' for name in [
        'node', 'deno', 'browser', 'browser-draft2', 'before-unit',
        'before-browser', 'before-summary', 'lint', 'secretlint',
        'format-check', 'duplication', 'mcp-server']],
    'ci-logs/choice-execution-mcp.json',
    'ci-logs/choice-execution-ci-runs.json',
    'ci-logs/choice-execution-ci-current.json',
    'ci-logs/checks-42975700692-webkit-130374999543.log',
    'ci-logs/checks-42975700692-gate-130385040885.log',
    *[str(p.relative_to(root)) for p in images],
], 'docs/case-studies/issue-56/data/provider-choices.tar.gz', {
    'parent': '33eac5b55e437a471b3fd37198fca5288f016ca5',
    'before': {'unit_failed': 2, 'unit_passed': 4, 'browser': 'missing strict metadata'},
    'node': 46, 'deno': 46, 'chromium_cases': 20,
    'mcp': ['desktop', 'mobile'],
    'remaining': 'Built-in HH routing, shared execution controls, current-head CI and every unchecked issue criterion.',
}, 'issue-56-provider-choices/**/*.png', before={production[0]: '33eac5b5'})
