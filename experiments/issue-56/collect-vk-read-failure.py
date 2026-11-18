"""Retain actual production fallback failure and finite truthful-read proof."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name, count in [('after', 2), ('compatible', 5)]:
    content = (logs / f'vk-read-failure-{name}.log').read_text()
    assert f'# pass {count}' in content and '# fail 0' in content
assert '# fail 1' in (logs / 'vk-read-failure-before.log').read_text()
assert not (logs / 'vk-read-failure-lint.log').read_text().strip()
assert not (logs / 'vk-read-failure-diff.log').read_text().strip()
assert json.loads((logs / 'vk-read-failure-after-ui.log').read_text()) == {
    'refusalVisible': True, 'acknowledgedSettingsRetained': True,
    'providerWrites': 0}
assert json.loads((logs / 'vk-read-failure-mcp-server.log').read_text().splitlines()[-1]) == {
    'providerWrites': 0, 'liveProvider': False, 'resourcesClosed': True}
names = [
    'js/src/web/vk-read-response.js', 'js/src/web/vk-provider-api.js',
    'js/tests/vk-read-failure.test.js', 'js/tests/helpers/e2e-vk-read-failure.mjs',
    'js/tests/e2e-vk-engagement-browser.mjs',
    *[f'experiments/issue-56/{name}' for name in (
        'vk-read-failure-before.py', 'collect-vk-read-failure.py',
        'vk-read-failure-native.mjs', 'vk-read-failure-mcp-server.mjs',
        'vk-legacy-catalogs-fixture.mjs', 'evidence_bundle.py')],
    'docs/case-studies/issue-56/vk-read-failure.md',
    'ci-logs/bb9d-lint-format.log', 'ci-logs/bb9d-format-correction.log',
    *[str(p.relative_to(root)) for p in sorted(logs.glob('vk-read-failure-*'))
      if p.suffix in ('.log', '.json')],
    *[str(p.relative_to(root)) for p in sorted(
        (root / 'docs/screenshots/issue-56-vk-read-failure').glob('*.png'))],
]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/src/web/vk-provider-api.js'] = subprocess.check_output(
    ['git', 'show', 'bb9d8f23:js/src/web/vk-provider-api.js'], cwd=root)
entries['metadata.json'] = b'{"issue_complete":false,"before":"bb9d8f23","focused_checks":7,"live_provider":false}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-read-failure.tar.gz', entries)
