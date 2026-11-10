"""Retain the bounded link-checker policy checks without fetching the network again."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 17' in (logs / 'links-concurrency-contracts.log').read_text()
assert 'read-only checkout policy' in (logs / 'links-concurrency-workflow-policy.log').read_text()
source = (root / '.github/workflows/links.yml').read_text()
assert '--max-concurrency 4' in source and '--retry-wait-time 2' in source
assert "--cache-exclude-status '408,429,500..600'" in source
assert '--accept' not in source and 'exit 1' in source
names = [str(path.relative_to(root)) for path in logs.glob('links-concurrency-*.log')
         if not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log'))]
names += ['ci-logs/links-concurrency-prior-runs.json', '.github/workflows/links.yml',
          'experiments/issue-56/collect-links-concurrency.py']
entries = {name: (root / name).read_bytes() for name in sorted(names)}
entries['metadata.json'] = (json.dumps({
    'date': '2026-11-10', 'preceding_head': 'ebbcfbe7', 'contract_checks': 17,
    'policy': 'pass', 'hosted': 'new exact-head result required',
    'reproduction': 'three attempts of 42859450035 on 32253199; complete logs in forms-reviewed-upload.tar.gz',
    'limits': 'remote root cause unproven; mitigation retains strict link failure semantics',
}, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/ci-links-concurrency.tar.gz'
with archive.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            for name, data in entries.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest()
              for entry in tar.getmembers() if entry.isfile()}
assert hashes == {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()}
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
    json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries')
