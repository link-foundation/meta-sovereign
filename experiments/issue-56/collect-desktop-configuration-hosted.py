"""Preserve actual hosted native TLS and runtime packaging receipt."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
jobs = json.loads((root / 'ci-logs/catalogs-desktop-jobs.json').read_text())['jobs']
assert all(j['head_sha'] == '3a24c7a51da9225e58b02c644a25c111c7e60834' for j in jobs)
assert sum(j['conclusion'] == 'success' for j in jobs) == 6
assert sum(j['conclusion'] == 'skipped' for j in jobs) == 1
log = (root / 'ci-logs/desktop-config-native-hosted.log').read_text()
assert all(f'"{key}":true' in log for key in (
    'nativeDesktopTls', 'ownedCertificateRequired', 'certificateListenerReleased',
    'nativeClipboard', 'foreignNavigationRefused'))
sources = ['js/electron/local-certificate.js', 'js/electron/window.js',
    'js/scripts/prepare-desktop.mjs', 'js/scripts/validate-desktop-runtime.mjs',
    'experiments/issue-56/desktop-config-electron.mjs',
    'experiments/issue-56/vk-token-electron.mjs', '.github/workflows/desktop-release.yml']
names = ['ci-logs/catalogs-desktop-jobs.json',
    'ci-logs/desktop-config-native-hosted.log',
    'docs/case-studies/issue-56/desktop-configuration-hosted.md',
    'experiments/issue-56/collect-desktop-configuration-hosted.py',
    'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in names}
for name in sources:
    entries[f'published/{name}'] = subprocess.check_output(
        ['git', 'show', f'3a24c7a5:{name}'], cwd=root)
entries['metadata.json'] = b'{"issue_complete":false,"head":"3a24c7a51da9225e58b02c644a25c111c7e60834","desktop_success":6,"publication":"skipped","full_main_acceptance":false}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/desktop-configuration-hosted.tar.gz', entries)
