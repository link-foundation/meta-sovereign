"""Freeze HH frame choice contracts, browser regressions and independent evidence."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
for name, expected in [('node', 'pass 39'), ('deno', '39 passed | 0 failed'),
                       ('chromium', '"cases":17'), ('provider-compat', '"cases":20'),
                       ('before-summary', 'expected browser regression confirmed')]:
    assert expected in (root / f'ci-logs/hh-browser-{name}.log').read_text()
for name in ['lint', 'secretlint']:
    assert not (root / f'ci-logs/hh-browser-{name}.log').read_text().strip()
result = json.loads((root / 'ci-logs/hh-browser-mcp.json').read_text())
text = result['content'][0]['text']
mcp = json.loads(text.split('### Result\n')[1].split('\n')[0])
assert not mcp['pageErrors'] and len(mcp['layouts']) == 2
assert all(item['receipt']['sent'] and item['ownerPreserved'] and item['navigationRefused']
           and item['clicks'] == 1 and item['text'] == 0 for item in mcp['layouts'])
images = sorted((root / 'docs/screenshots/issue-56-hh-choices').rglob('*.png'))
assert len(images) == 12 and len({p.name for p in images}) == 12
production = [f'js/src/sources/{name}.js' for name in [
    'hh-web-ui', 'web-uis', 'browser-choice-document', 'browser-choices',
    'browser-choice-controller', 'browser-choice-reader', 'browser-sender']]
bundle(root, [
    *production,
    'js/tests/hh-web-ui.test.js', 'js/tests/helpers/e2e-hh-choices.mjs',
    'js/tests/e2e-questions-browser.mjs',
    *[str(p.relative_to(root)) for p in (root / 'experiments/issue-56').glob('hh-choice*') if p.is_file()],
    'experiments/issue-56/provider-choice-fixture.mjs',
    'experiments/issue-56/collect-hh-choices.py',
    'docs/case-studies/issue-56/hh-browser-choices.md',
    *[f'ci-logs/hh-browser-{name}.log' for name in [
        'node', 'deno', 'chromium', 'provider-compat', 'before', 'before-summary',
        'lint', 'format-check', 'secretlint', 'duplication', 'mcp-server',
        'chromium-draft', 'chromium-draft2', 'chromium-draft3', 'chromium-draft4',
        'node-draft', 'deno-draft']],
    'ci-logs/hh-browser-mcp.json', 'ci-logs/hh-browser-ci-runs.json',
    'ci-logs/hh-browser-ci-current.json',
    'ci-logs/qa-buttons-reference-head.json',
    'ci-logs/qa-buttons-reference/forms-and-chats.md',
    *[str(p.relative_to(root)) for p in images],
], 'docs/case-studies/issue-56/data/hh-browser-choices.tar.gz', {
    'parent': '2a0fb639a6b0156a0249590b040664ef8fa86fb6',
    'before': 'Built-in HH unavailable: unsupported-source',
    'node': 39, 'deno': 39, 'hh_chromium_cases': 17,
    'configured_provider_cases': 20, 'mcp': mcp,
    'remaining': 'Shared execution controls, summary recovery, durable reload recovery, provider watchers, live parity, exact-head CI and all unchecked criteria.',
}, 'issue-56-hh-choices/**/*.png', before={production[1]: '2a0fb639'})
