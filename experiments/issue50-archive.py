"""Rebuild the issue50 evidence archive and SHA256 inventories.

Only collected data directories are included. Streaming keeps memory bounded;
stable gzip/tar headers make repeated runs over unchanged inputs identical.
Run after all evidence collectors finish, then extract and verify in a new dir.
"""
import gzip
import hashlib
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1] / 'dev/log/issues/50/pulls/51'
GROUPS = ('ci-logs', 'github', 'local', 'research')


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(64 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def archive():
    files = sorted(path for group in GROUPS
                   for path in (ROOT / group).rglob('*') if path.is_file())
    if any(path.is_symlink() for path in files):
        raise ValueError('Evidence must contain regular files, not symlinks')
    temporary = ROOT / 'evidence.tar.gz.tmp'
    destination = ROOT / 'evidence.tar.gz'
    with temporary.open('wb') as output:
        with gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|') as bundle:
                for path in files:
                    info = bundle.gettarinfo(str(path), str(path.relative_to(ROOT)))
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    info.mode = 0o644
                    with path.open('rb') as source:
                        bundle.addfile(info, source)
    temporary.replace(destination)
    inventory = ROOT / 'evidence-files.sha256'
    inventory.write_text(''.join(
        f'{digest(path)}  {path.relative_to(ROOT)}\n' for path in files))
    (ROOT / 'evidence.sha256').write_text(
        f'{digest(destination)}  {destination.name}\n'
        f'{digest(inventory)}  {inventory.name}\n')
    print(f'Archived {len(files)} files in {destination.stat().st_size} bytes')


if __name__ == '__main__':
    archive()
