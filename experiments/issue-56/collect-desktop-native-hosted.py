"""Bind native desktop launch and Windows cleanup to their actual hosted source."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
source = '93271feed9d0a6105c087b0918600d7fb3db521f'
selected = '94efd84bfcd43304d4986494efded5652bb889ec'
jobs = json.loads((logs / 'desktop-criterion-932-jobs.json').read_text())
artifacts = json.loads((logs / 'desktop-criterion-932-artifacts.json').read_text())['artifacts']
assert jobs['headSha'] == source and jobs['conclusion'] == 'success'
entries = {}
receipts = {}
for platform, native, arch in [('windows-x64', 'win32', 'x64'),
                              ('windows-arm64', 'win32', 'arm64'),
                              ('linux-x64', 'linux', 'x64'),
                              ('linux-arm64', 'linux', 'arm64'),
                              ('macos', 'darwin', 'arm64')]:
    job = next(job for job in jobs['jobs'] if job['name'] == f'Build ({platform})')
    assert job['conclusion'] == 'success'
    log_name = f'ci-logs/desktop-criterion-932-{platform}.log'
    text = (root / log_name).read_text()
    matches = [(i, line[line.index('{"packagedDesktop"'):])
               for i, line in enumerate(text.splitlines(), 1) if '{"packagedDesktop"' in line]
    assert len(matches) == 1
    line, raw = matches[0]
    receipt = json.loads(raw)
    assert receipt['platform'] == native and receipt['arch'] == arch
    assert receipt['windows'] == 1
    for key in ['packagedDesktop', 'packaged', 'visible', 'contextIsolation',
                'backendReady', 'cleanExit', 'runtimeDrained']:
        assert receipt[key] is True, (platform, key)
    assert not receipt['nodeIntegration'] and not receipt['liveProvider']
    if native == 'win32':
        assert 'Silent installation completed without an automatic application launch' in text
        assert 'Installed package launch and owned uninstall completed' in text
    artifact = next(item for item in artifacts if item['name'] == f'desktop-launch-{platform}')
    assert artifact['workflow_run']['head_sha'] == source
    screenshot = f'docs/screenshots/issue-56-desktop-{platform}-93271fee.png'
    png = (logs / f'desktop-criterion-932-screenshots/{platform}/desktop-launch-{platform}.png').read_bytes()
    assert png.startswith(b'\x89PNG\r\n\x1a\n')
    (root / screenshot).write_bytes(png)
    entries[screenshot] = png
    entries[log_name] = (root / log_name).read_bytes()
    receipts[platform] = dict(job=job['databaseId'], line=line, receipt=receipt,
                              artifact=artifact['id'], screenshot=screenshot)
main = json.loads((logs / 'desktop-criterion-932-main.json').read_text())
for runtime, job_id in [('node-1', 133902629916), ('bun', 133902629560), ('deno-1', 133902629842)]:
    assert next(job for job in main['jobs'] if job['databaseId'] == job_id)['conclusion'] == 'success'
    name = f'ci-logs/windows-cleanup-932-{runtime}.log'
    text = (root / name).read_text()
    for test in ['Windows cleanup waits for resources after the executable disappears',
                 'Windows cleanup fails finitely when the uninstaller leaves resources']:
        line = next(line for line in text.splitlines() if test in line)
        assert any(marker in line for marker in ['✔ ', '(pass)', 'ok\x1b']), line
    entries[name] = (root / name).read_bytes()
sources = ['.github/workflows/desktop-release.yml',
           'js/scripts/verify-windows-packages.ps1', 'js/scripts/wait-windows-uninstall.ps1',
           'js/tests/desktop-windows-cleanup.test.js',
           'experiments/issue-56/desktop-packaged-launch.mjs', 'desktop/adhoc-sign-mac.cjs',
           'js/scripts/verify-macos-packages.sh',
           *[f'docs/USER-GUIDE{locale}.md' for locale in ['', '.ru', '.hi', '.zh']]]
hashes = {}
for name in sources:
    hosted = subprocess.check_output(['git', 'show', f'{source}:{name}'], cwd=root)
    current = subprocess.check_output(['git', 'show', f'{selected}:{name}'], cwd=root)
    assert hosted == current, f'source changed after hosted verification: {name}'
    entries[name] = current
    hashes[name] = hashlib.sha256(current).hexdigest()
for name in ['desktop-criterion-932-jobs.json', 'desktop-criterion-932-artifacts.json',
             'desktop-criterion-932-main.json', 'desktop-criterion-932-pipeline.log',
             'desktop-criterion-932-main-cancelled.log']:
    entries[f'ci-logs/{name}'] = (logs / name).read_bytes()
for name in ['experiments/issue-56/collect-desktop-native-hosted.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/desktop-native-hosted.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'source': source, 'selectedSource': selected, 'sources': hashes, 'receipts': receipts,
    'desktopWorkflow': 44042469209, 'windowsCleanupRuntimes': ['Node', 'Deno', 'Bun'],
    'mainWorkflow': 'superseded; 37 successes, 16 cancellations, aggregate failure',
    'acceptance': False, 'fullIssueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/desktop-native-hosted.tar.gz', entries)
