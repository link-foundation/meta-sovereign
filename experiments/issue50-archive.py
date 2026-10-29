"""Rebuild the issue50 evidence archive and SHA256 inventories.

Only collected data directories are included. Streaming keeps memory bounded;
stable gzip/tar headers make repeated runs over unchanged inputs identical.
Run after all evidence collectors finish, then extract and verify in a new dir.
"""
import gzip
import hashlib
import argparse
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


def archive(paths=None, stem='evidence'):
    files = sorted(paths if paths is not None else (
        path for group in GROUPS
        for path in (ROOT / group).rglob('*') if path.is_file()))
    if any(not path.resolve().is_relative_to(ROOT.resolve())
           or not path.is_file() for path in files):
        raise ValueError('Evidence must be existing files under the evidence root')
    if any(path.is_symlink() for path in files):
        raise ValueError('Evidence must contain regular files, not symlinks')
    temporary = ROOT / f'{stem}.tar.gz.tmp'
    destination = ROOT / f'{stem}.tar.gz'
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
    inventory = ROOT / f'{stem}-files.sha256'
    inventory.write_text(''.join(
        f'{digest(path)}  {path.relative_to(ROOT)}\n' for path in files))
    (ROOT / f'{stem}.sha256').write_text(
        f'{digest(destination)}  {destination.name}\n'
        f'{digest(inventory)}  {inventory.name}\n')
    print(f'Archived {len(files)} files in {destination.stat().st_size} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--paths-file', type=Path)
    parser.add_argument('--stem', default='evidence')
    options = parser.parse_args()
    if Path(options.stem).name != options.stem or options.stem in ('.', '..'):
        parser.error('--stem must be a filename stem')
    selected = None
    if options.paths_file:
        selected = [ROOT / line for line in options.paths_file.read_text().splitlines()
                    if line]
    archive(selected, options.stem)
