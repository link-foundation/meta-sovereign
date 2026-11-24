"""Preserve the actual native Windows receipt and subsequent NSIS cleanup race."""
import json
import subprocess
from evidence_bundle import (
    evidence_context, changed_sources, evidence_logs, verify_evidence,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'windows-uninstall')
failure = logs / 'desktop-installation-windows-x64-133892687330.log'
text = failure.read_text()
assert 'Silent installation completed without an automatic application launch' in text
assert 'Could not find file' in text and 'Remove-Item $ownedRoot' in text
line = next(line for line in text.splitlines() if '{"packagedDesktop"' in line)
receipt = json.loads(line[line.index('{"packagedDesktop"'):])
assert receipt['platform'] == 'win32' and receipt['arch'] == 'x64'
assert all(receipt[key] for key in ['packagedDesktop', 'packaged', 'visible',
    'contextIsolation', 'backendReady', 'cleanExit', 'runtimeDrained'])
assert not receipt['nodeIntegration'] and not receipt['liveProvider']
verify_evidence(read, {
    'focused': ['pass 1', 'fail 0', 'skipped 2'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint-final', 'secrets', 'diff'))
names = changed_sources(root) + evidence_logs(root, 'windows-uninstall')
names += [str(failure.relative_to(root)), 'ci-logs/desktop-installation-hosted-jobs.json']
for name in ['desktop-installation-windows-arm64-133892687357.log',
             'desktop-installation-lint-133892749945.log',
             'desktop-installation-pipeline-133894379977.log']:
    assert (logs / name).stat().st_size > 0
    names.append(f'ci-logs/{name}')
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/scripts/verify-windows-packages.ps1'] = subprocess.check_output(
    ['git', 'show', '935fbf8e:js/scripts/verify-windows-packages.ps1'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': '935fbf8e', 'nativeJob': 133892687330, 'nativeReceipt': receipt,
    'localPowerShellAvailable': False, 'nativeRegressionChecks': 'pending hosted Windows CI',
    'acceptance': False, 'fullIssueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/ci-windows-uninstall.tar.gz', entries)
