"""Archive issue 54 evidence using the existing streaming evidence packer."""

import importlib.util
import argparse
import gzip
import hashlib
import lzma
from pathlib import Path
import shutil
import tempfile
import tarfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('evidence', ROOT / 'experiments/issue50-archive.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)
packer.ROOT = ROOT / 'dev/log/issues/54/pulls/55'
packer.GROUPS = ('github', 'ci-logs', 'metadata', 'artifacts', 'templates', 'comparison', 'research', 'validation')


def verify():
    for line in (packer.ROOT / 'evidence.sha256').read_text().splitlines():
        expected, name = line.split('  ', 1)
        if name not in ('evidence.tar.xz', 'evidence-files.sha256'):
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
    with tarfile.open(packer.ROOT / 'evidence.tar.xz', mode='r|xz') as bundle:
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
    # The larger LZMA dictionary deduplicates repeated diagnostic ZIPs. Keep
    # streaming and preset 6 (about 110 MiB measured RSS) rather than buffering
    # the uncompressed tar or using a memory-heavy extreme compression preset.
    original = packer.ROOT / 'evidence.tar.gz'
    temporary = packer.ROOT / 'evidence.tar.xz.tmp'
    destination = packer.ROOT / 'evidence.tar.xz'
    with gzip.open(original, 'rb') as source:
        with lzma.open(temporary, 'wb', preset=6) as target:
            shutil.copyfileobj(source, target, length=64 * 1024)
    if temporary.stat().st_size >= 50 * 1024 * 1024:
        raise ValueError('Evidence exceeds GitHub recommended file size; split the collection')
    temporary.replace(destination)
    original.unlink()
    inventory = packer.ROOT / 'evidence-files.sha256'
    (packer.ROOT / 'evidence.sha256').write_text(
        f'{packer.digest(destination)}  {destination.name}\n'
        f'{packer.digest(inventory)}  {inventory.name}\n')
    print(f'XZ archive: {destination.stat().st_size} bytes', flush=True)
    with tempfile.TemporaryDirectory(prefix='issue54-evidence-') as temporary:
        destination = Path(temporary)
        with tarfile.open(packer.ROOT / 'evidence.tar.xz') as bundle:
            bundle.extractall(destination, filter='data')
        entries = (packer.ROOT / 'evidence-files.sha256').read_text().splitlines()
        for entry in entries:
            expected, name = entry.split('  ', 1)
            assert packer.digest(destination / name) == expected, name
        print(f'Extracted and verified {len(entries)} files')
    verify()
