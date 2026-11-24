"""Preserve bounded Follow checks, CI investigation and source/image hashes."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
names = [str(p.relative_to(root)) for p in sorted((root / 'ci-logs').glob('follow-links-*.log'))]
names += [
    'ci-logs/follow-links-mcp.json',
    'ci-logs/run-42748203988.log',
    'ci-logs/run-42748203988.json',
    'ci-logs/requirements-format-230f.log',
    'ci-logs/f49ea3e5-runs.json',
    'ci-logs/f49ea3e5-checks.json',
    'experiments/issue-56/follow-links-ui.mjs',
    'experiments/issue-56/collect-follow-link-evidence.py',
]
sources = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).splitlines()
sources += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
sources = sorted({n for n in sources if not n.endswith(('.tar.gz', '.sha256.json'))})
metadata = {
    'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'checks': {'follow': 12, 'locale': 25, 'browser': 'production Chromium; independent MCP desktop/mobile', 'lint_format_bundle': 'passed'},
    'upstream': {'commit': 'af8fbb80cec26a7b5b205c93314372d1d92cec1f', 'finding': 'https://github.com/konard/follow/issues/17', 'method': 'static; upstream code not executed'},
    'limits': 'Isolated stores and offline provider-shaped fixtures. No external writes except the authorized upstream defect report and PR updates. Full matrices in CI. FL01 and FL03–FL09 and other issue-wide criteria remain open.',
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
}
archive = root / 'docs/case-studies/issue-56/data/follow-links.tar.gz'
payload = (json.dumps(metadata, indent=2) + '\n').encode()
with tarfile.open(archive, 'w:gz') as tar:
    for name in names:
        tar.add(root / name, arcname=name)
    entry = tarfile.TarInfo('metadata.json')
    entry.size = len(payload)
    tar.addfile(entry, io.BytesIO(payload))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest() for entry in tar.getmembers() if entry.isfile()}
assert set(hashes) == set(names) | {'metadata.json'}
for name in names:
    assert hashes[name] == hashlib.sha256((root / name).read_bytes()).hexdigest()
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries and {len(metadata["sources"])} source/image hashes')
