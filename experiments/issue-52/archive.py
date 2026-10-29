"""Archive issue 52 evidence using the existing streaming evidence packer."""

import importlib.util
import argparse
import hashlib
from pathlib import Path
import tempfile
import tarfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('evidence', ROOT / 'experiments/issue50-archive.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)
packer.ROOT = ROOT / 'dev/log/issues/52/pulls/53'
packer.GROUPS = ('ci-logs', 'metadata', 'artifacts', 'templates', 'comparison', 'research', 'validation')


def verify():
    for line in (packer.ROOT / 'evidence.sha256').read_text().splitlines():
        expected, name = line.split('  ', 1)
        if name not in ('evidence.tar.gz', 'evidence-files.sha256'):
            raise ValueError(f'Unexpected checksum target: {name}')
        if packer.digest(packer.ROOT / name) != expected:
            raise ValueError(f'Checksum mismatch: {name}')
    entries = {}
    for line in (packer.ROOT / 'evidence-files.sha256').read_text().splitlines():
        expected, name = line.split('  ', 1)
        if name in entries:
            raise ValueError(f'Duplicate inventory entry: {name}')
        entries[name] = expected
    seen = set()
    with tarfile.open(packer.ROOT / 'evidence.tar.gz', mode='r|gz') as bundle:
        for member in bundle:
            if not member.isfile() or member.name not in entries or member.name in seen:
                raise ValueError(f'Unexpected archive member: {member.name}')
            digest = hashlib.sha256()
            with bundle.extractfile(member) as stream:
                for chunk in iter(lambda: stream.read(64 * 1024), b''):
                    digest.update(chunk)
            if digest.hexdigest() != entries[member.name]:
                raise ValueError(f'Member checksum mismatch: {member.name}')
            seen.add(member.name)
    if seen != entries.keys():
        raise ValueError('Missing archive members')
    print(f'Verified bundle, inventory and all {len(seen)} member digests')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        verify()
        raise SystemExit(0)
    packer.archive()
    with tempfile.TemporaryDirectory(prefix='issue52-evidence-') as temporary:
        destination = Path(temporary)
        with tarfile.open(packer.ROOT / 'evidence.tar.gz') as bundle:
            bundle.extractall(destination, filter='data')
        entries = (packer.ROOT / 'evidence-files.sha256').read_text().splitlines()
        for entry in entries:
            expected, name = entry.split('  ', 1)
            assert packer.digest(destination / name) == expected, name
        print(f'Extracted and verified {len(entries)} files')
    verify()
