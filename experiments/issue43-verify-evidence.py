"""Verify the issue-43 archive without executing any downloaded source."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dev/log/issues/43/pulls/44'


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def main():
    inventory = json.loads((DEST / 'comparison/file-inventory.json').read_text())
    assert len(inventory) == 356
    for row in inventory:
        source = DEST / 'templates' / row['template'] / 'files' / row['path']
        assert digest(source) == row['sha256'], source
        if row.get('local_counterpart'):
            assert digest(ROOT / row['local_counterpart']) == row['local_sha256'], row['local_counterpart']
    checksums = DEST / 'artifacts/SHA256SUMS'
    for line in checksums.read_text().splitlines():
        if not line.strip():
            continue
        expected, name = line.split(maxsplit=1)
        name = name.lstrip('*')
        target = DEST / 'artifacts' / Path(name).name
        assert digest(target) == expected, target
    # Public GitHub logs are normally redacted. Keep an independent check for
    # actual credential shapes; record locations only, never credential text.
    pattern = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|npm_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)')
    candidates = []
    scanned = 0
    for file in sorted(DEST.rglob('*')):
        if not file.is_file() or file.suffix == '.zip':
            continue
        scanned += 1
        with file.open('rb') as source:
            for number, line in enumerate(source, 1):
                if pattern.search(line):
                    candidates.append({'path': str(file.relative_to(DEST)), 'line': number})
    result = {'files_scanned': scanned, 'potential_credential_locations': candidates}
    (DEST / 'local/credential-pattern-review.json').write_text(json.dumps(result, indent=2) + '\n')
    assert not candidates, 'Review the recorded locations before publication'
    print(f'Verified {len(inventory)} pinned source hashes, artifact checksums and {scanned} evidence files')


if __name__ == '__main__':
    main()
