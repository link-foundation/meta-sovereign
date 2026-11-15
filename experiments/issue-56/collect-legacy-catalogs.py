"""Retain actual-parent list failures, native views and focused read evidence."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name, count in [('after', 6), ('compatibility', 9)]:
    content = (logs / f'vk-legacy-catalogs-{name}.log').read_text()
    assert f'# pass {count}' in content and '# fail 0' in content
assert '# fail 2' in (logs / 'vk-legacy-catalogs-before.log').read_text()
assert not (logs / 'vk-legacy-catalogs-lint.log').read_text().strip()
assert not (logs / 'vk-legacy-catalogs-diff.log').read_text().strip()
for name, expected in [('before', False), ('after', True)]:
    assert json.loads((logs / f'vk-legacy-catalogs-{name}-ui.log').read_text()) == {
        'ownerCatalogsReadable': expected, 'providerWrites': 0, 'pageErrors': 0}
assert json.loads((logs / 'vk-legacy-catalogs-mcp-server.log').read_text().splitlines()[-1]) == {
    'providerWrites': 0, 'liveProvider': False, 'resourcesClosed': True}
sources = [f'js/src/automation/vk-{name}-settings.js' for name in (
    'friends', 'personal', 'wall', 'birthday', 'reengage', 'retention')]
names = [*sources,
    'js/src/automation/vk-legacy-lists.js', 'js/tests/vk-legacy-catalogs.test.js',
    'js/tests/helpers/e2e-vk-legacy-catalogs.mjs',
    'js/tests/e2e-vk-engagement-browser.mjs',
    *[f'experiments/issue-56/{name}' for name in (
        'legacy-catalogs-before.py', 'collect-legacy-catalogs.py',
        'legacy-catalogs-native.mjs', 'legacy-catalogs-mcp-server.mjs',
        'vk-legacy-catalogs-fixture.mjs', 'evidence_bundle.py')],
    'docs/case-studies/issue-56/legacy-catalogs.md',
    *[str(p.relative_to(root)) for p in sorted(logs.glob('vk-legacy-catalogs-*'))
      if p.suffix in ('.log', '.json')],
    *[f'ci-logs/vk-desktop-reference-{name}.source' for name in (
        'config', 'list-values', 'list-values.test')],
    *[str(p.relative_to(root)) for p in sorted(
        (root / 'docs/screenshots/issue-56-legacy-catalogs').glob('*.png'))],
]
entries = {name: (root / name).read_bytes() for name in names}
for name in sources:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'3a24c7a5:{name}'], cwd=root)
entries['metadata.json'] = b'{"issue_complete":false,"before":"3a24c7a5","focused_checks":15,"live_provider":false}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/legacy-catalogs.tar.gz', entries)
