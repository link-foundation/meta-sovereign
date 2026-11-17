"""Bind the strict audit repair to actual source, installer and CI receipts."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
from evidence_bundle import changed_sources, evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'picomatch-{name}.log').read_text()
verify_evidence(read, {
    'before': ['fail 1', "actual: '^(?:(?=.)(?:[^/]*?)+c)$'"],
    'desktop-before': ['fail 2', 'undefined', 'ENOENT'],
    'focused-final': ['pass 31', 'fail 0', 'skipped 1'],
    'bun-installation': ['4 pass', '0 fail'],
    'deno-installation-final': ['4 passed | 0 failed'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
    'fork-reproducible': ['Verified 9 vendored entries'],
})
audit = json.loads((logs / 'picomatch-audit-final.json').read_text())
assert audit['vulnerabilities'] == {} and audit['metadata']['vulnerabilities']['total'] == 0
runs = json.loads((logs / 'd3513d39-latest-runs.json').read_text())
assert len(runs) == 5 and {run['headSha'] for run in runs} == {
    'd3513d3988c276838c180809a06426af20f5d263'}
assert sum(run['conclusion'] == 'failure' for run in runs) == 2
assert '21 high severity vulnerabilities' in (logs / 'd3513d39-audit-failed.log').read_text()
parent = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
assert parent.startswith('322b7fab')
provenance = json.loads((root / 'vendor/picomatch/provenance.json').read_text())
artifact = root / 'vendor/picomatch/picomatch-4.0.7-patched.1.tgz'
assert hashlib.sha256(artifact.read_bytes()).hexdigest() == provenance['archiveSha256']
with tarfile.open(artifact) as archive:
    fork = {member.name: archive.extractfile(member).read() for member in archive.getmembers()}
assert len(fork) == 9
for name, value in fork.items():
    assert hashlib.sha256(value).hexdigest() == provenance['after'][name.removeprefix('package/')]
original = logs / 'picomatch-4.0.7.tgz'
assert hashlib.sha256(original.read_bytes()).hexdigest() == provenance['upstreamSha256']
names = [name for name in changed_sources(root) if not name.endswith('PLAN.md')]
names += evidence_logs(root, 'picomatch') + evidence_logs(root, 'd3513d39')
names += [str(path.relative_to(root)) for path in logs.glob('picomatch-*.diff')]
names += ['ci-logs/picomatch-4.0.7.tgz', 'js/scripts/command-process.mjs',
          'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries.update({f'fork-source/{name}': value for name, value in fork.items()})
for name in ['package.json', 'package-lock.json', 'deno.json', '.github/workflows/release.yml']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, failedSource=runs[0]['headSha'],
    acceptance=False, acceptedCriteria=83, unfinishedCriteria=35, registryAudit=audit['metadata'],
    privateSourceCoveredByRegistryAudit=False, fork=provenance, hostedVerificationPending=True,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-picomatch-security.tar.gz', entries)
