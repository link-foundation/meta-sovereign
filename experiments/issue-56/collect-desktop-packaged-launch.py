"""Preserve native packaged boot and the portable-validator CI regression."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
revision = 'b558bd7424cd03b8e2a50e07ce123635a62b72f1'
job = json.loads((logs / 'hosted-b558-macos-packaging-job.json').read_text())
assert job['head_sha'] == revision and job['conclusion'] == 'success'
raw = (logs / 'hosted-b558-macos-packaging.log').read_text()
receipt = next(json.loads(line[line.index('{"packagedDesktop"'):])
               for line in raw.splitlines() if '{"packagedDesktop"' in line)
assert receipt['platform'] == 'darwin' and receipt['arch'] == 'arm64'
for key in ['packagedDesktop', 'packaged', 'visible', 'contextIsolation',
            'backendReady', 'cleanExit', 'runtimeDrained']:
    assert receipt[key] is True
assert receipt['windows'] == 1
assert receipt['nodeIntegration'] is False and receipt['liveProvider'] is False
assert 'TS2307' in (logs / 'desktop-packaged-deno-before.log').read_text()
assert '1 passed | 0 failed' in (logs / 'desktop-packaged-deno-after.log').read_text()
assert 'pass 1' in (logs / 'desktop-packaged-deno-node.log').read_text()
assert not (logs / 'desktop-packaged-deno-lint.log').read_text().strip()
names = [
    'experiments/issue-56/collect-desktop-packaged-launch.py',
    'experiments/issue-56/desktop-packaged-launch.mjs',
    'js/tests/desktop-packaged-launch.test.js',
    'docs/case-studies/issue-56/desktop-packaged-launch.md',
    'docs/case-studies/issue-56/desktop-packaged-launch-plan.md',
    'docs/screenshots/issue-56-packaged-macos-arm64.png',
    'ci-logs/hosted-b558-macos-packaging-job.json',
    'ci-logs/hosted-b558-macos-packaging.log',
    'ci-logs/hosted-b558-desktop-artifacts.json',
]
names += [str(p.relative_to(root)) for p in logs.glob('desktop-packaged-deno-*.log')]
for ident in [133377236381, 133377236733, 133377236845,
              133377237014, 133377237458]:
    path = f'ci-logs/hosted-b558-job-{ident}.log'
    assert 'TS2307' in (root / path).read_text()
    names.append(path)
entries = {name: (root / name).read_bytes() for name in names}
for name in ['experiments/issue-56/desktop-packaged-launch.mjs',
             '.github/workflows/desktop-release.yml']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{revision}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'source_revision': revision, 'native_job': job['html_url'],
    'native_receipt': receipt, 'screenshot_artifact': 14236881026,
    'gatekeeper_manually_tested': False, 'other_cpu_launched': False,
    'full_issue_complete': False, 'inventory_accepted': False,
    'deno_regression': 'TS2307 static Playwright import; focused test now passes',
    'corrected_native_hosted_recheck': 'required',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/desktop-packaged-launch.tar.gz', entries)
