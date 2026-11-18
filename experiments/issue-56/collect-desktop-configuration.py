"""Retain finite exact-parent configuration, FIFO and packaging evidence."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name in ('before', 'packaging-before'):
    assert '# fail 1' in (logs / f'desktop-config-{name}.log').read_text()
assert '# pass 49' in (logs / 'desktop-config-focused.log').read_text()
assert '# fail 0' in (logs / 'desktop-config-focused.log').read_text()
assert '# pass 1' in (logs / 'desktop-config-entry-focused.log').read_text()
assert not (logs / 'desktop-config-lint.log').read_text().strip()
assert json.loads((logs / 'desktop-config-fifo-before.log').read_text()) == {
    'blockedBeforeRegularFileCheck': True}
assert json.loads((logs / 'desktop-config-fifo-after.log').read_text()) == {
    'fifoRefused': True, 'openedServer': False}
names = [
    *[f'js/electron/{name}.js' for name in (
        'main', 'configuration', 'local-certificate', 'window')],
    'js/scripts/prepare-desktop.mjs', 'js/scripts/validate-desktop-runtime.mjs',
    *[f'js/src/cli/{name}.js' for name in (
        'server-options', 'serve-command', 'startup-configuration')],
    *[f'js/tests/{name}.test.js' for name in (
        'desktop-configuration', 'desktop-lifecycle', 'desktop-packaging',
        'desktop-runtime-packaging', 'startup-configuration',
        'vk-token-electron-entry')],
    *[f'experiments/issue-56/{name}' for name in (
        'desktop-config-before.py', 'desktop-config-electron.mjs',
        'startup-config-fifo.mjs', 'vk-token-electron.mjs',
        'collect-desktop-configuration.py', 'evidence_bundle.py')],
    'docs/case-studies/issue-56/desktop-configuration.md',
    'docs/SERVER-CONFIGURATION.md',
    *[f'ci-logs/desktop-config-{name}.log' for name in (
        'before', 'packaging-before', 'before-helper', 'focused',
        'entry-focused', 'lint', 'fifo-before', 'fifo-after',
        'held-fixture-failure')],
    *[f'ci-logs/desktop-config-electron-{name}.source' for name in (
        'app', 'session', 'certificate')],
]
entries = {name: (root / name).read_bytes() for name in names}
for name in ('js/electron/main.js', 'js/scripts/prepare-desktop.mjs',
             'js/src/cli/startup-configuration.js'):
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'425e6ce6:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False, 'before': '425e6ce6', 'focused_checks': 50,
    'native_tls': 'pending hosted verification',
    'production_dependency_install': 'pending hosted verification',
    'electron_docs': 'electron/electron@v45.3.2/docs/api',
    'provider_live': False,
}) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/desktop-configuration.tar.gz', entries)
