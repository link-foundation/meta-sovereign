"""Bind the complete desktop packaging contract to one successful CI source."""
from pathlib import Path
import base64
import hashlib
import json
import subprocess
import sys
from desktop_artifact_evidence import validate_desktop_metadata
from evidence_bundle import write_entries_archive
from hosted_evidence import read_workflows, read_jobs, read_literal_tests, source_reader

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
platforms = {'linux-x64': ('linux', 'x64'), 'linux-arm64': ('linux', 'arm64'),
             'windows-x64': ('win32', 'x64'), 'windows-arm64': ('win32', 'arm64'),
             'macos': ('darwin', 'arm64')}
selection = {f'desktop-{name}': ('Desktop release', f'Build ({name})') for name in platforms}
selection['node'] = ('Checks and release', 'Test (node on ubuntu-26.04)')
raw, jobs = read_jobs(root, runs, slug, selection, entries)
source = source_reader(root, sha, entries)
tests = read_literal_tests(['desktop-packaged-launch', 'desktop-dmg-cleanup',
                           'desktop-updater-compatibility'], source, raw['node'])
tests.update(read_literal_tests(['desktop-packaging'], source, raw['node'], 'it'))
assert sum(map(len, tests.values())) == 25


def retained(name):
    data = (root / name).read_bytes()
    entries[name] = data
    return json.loads(data)


merge = retained(f'ci-logs/desktop-{slug}-merge-response.json')
head = retained(f'ci-logs/desktop-{slug}-head-response.json')
assert head['sha'] == sha and len(merge['parents']) == 2
assert merge['parents'][1]['sha'] == sha
assert merge['commit']['tree']['sha'] == head['commit']['tree']['sha']
catalog = retained(f'ci-logs/desktop-{slug}-artifacts.json')['artifacts']
assert len(catalog) == 10
assert all(not item['expired'] and item['workflow_run']['head_sha'] == sha for item in catalog)
directory = root / f'ci-logs/desktop-{slug}-metadata'
metadata = validate_desktop_metadata(directory, merge['sha'])
for path in sorted(directory.iterdir()):
    entries[str(path.relative_to(root))] = path.read_bytes()
for item in metadata['artifacts']:
    actual = next(entry for entry in catalog if entry['id'] == item['id'])
    assert (actual['name'], actual['digest'], actual['size_in_bytes']) == (
        item['name'], item['digest'], item['archiveBytes'])

receipts = {}
for platform, (os_name, architecture) in platforms.items():
    lines = raw[f'desktop-{platform}']
    values = [(i, json.loads(line[line.index('{"packagedDesktop"'):]))
              for i, line in enumerate(lines, 1) if '{"packagedDesktop"' in line]
    assert len(values) == 1
    line, receipt = values[0]
    assert receipt == dict(packagedDesktop=True, platform=os_name, arch=architecture,
        packaged=True, windows=1, visible=True, contextIsolation=True,
        nodeIntegration=False, backendReady=True, cleanExit=True,
        runtimeDrained=True, liveProvider=False), platform
    if os_name == 'win32':
        for marker in ['Silent installation completed without an automatic application launch',
                       'Installed package launch and owned uninstall completed']:
            assert sum(marker in value for value in lines) == 1
    screenshot = f'ci-logs/desktop-{slug}-screenshots/desktop-launch-{platform}/desktop-launch-{platform}.png'
    png = (root / screenshot).read_bytes()
    assert png.startswith(b'\x89PNG\r\n\x1a\n')
    entries[screenshot] = png
    receipts[platform] = dict(line=line, result=receipt,
        screenshotSha256=hashlib.sha256(png).hexdigest())
mac_log = '\n'.join(raw['desktop-macos'])
assert mac_log.count(': valid on disk') == 4
assert mac_log.count(': satisfies its Designated Requirement') == 4
for name in ['desktop/electron-builder.config.cjs', 'desktop/adhoc-sign-mac.cjs',
             'js/scripts/prepare-desktop.mjs', 'js/scripts/build-desktop.mjs',
             'js/scripts/verify-macos-packages.sh', 'js/scripts/verify-windows-packages.ps1',
             'js/scripts/wait-windows-uninstall.ps1', 'js/scripts/validate-desktop-assets.mjs',
             '.github/workflows/desktop-release.yml', '.github/workflows/release.yml',
             'experiments/issue-56/desktop-packaged-launch.mjs', 'README.md', 'README.ru.md',
             *[f'docs/USER-GUIDE{locale}.md' for locale in ['', '.ru', '.hi', '.zh']],
             *[f'js/src/web/download/{stem}.js' for stem in ['copy', 'page', 'model']]]:
    source(name)
reference = retained('ci-logs/vk-desktop-reference-requirements.json')
decoded = base64.b64decode(reference['content'])
assert hashlib.sha1(b'blob ' + str(len(decoded)).encode() + b'\0' + decoded).hexdigest() == reference['sha']
entries['references/vk-desktop-requirements.md'] = decoded
for name in ['desktop_artifact_evidence.py', 'collect-desktop-packaging-hosted.py',
             'hosted_evidence.py', 'evidence_bundle.py']:
    path = f'experiments/issue-56/{name}'
    entries[path] = (root / path).read_bytes()
report = 'docs/case-studies/issue-56/desktop-packaging-criteria-audit.md'
entries[report] = (root / report).read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, criterion='VD09',
    workflows=5, jobs=jobs, portableTests=tests, nativeReceipts=receipts,
    artifactValidation=metadata, referenceBlob=reference['sha'],
    releasePublication='intentionally skipped on pull requests',
    acceptance=False, fullIssueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/desktop-packaging-hosted-{slug}.tar.gz', entries)
