"""Pack, verify or restore immutable issue-43 evidence without executing it.

The bundle keeps GitHub's complete PR diff below the 300-file comparison limit.
Reports and the embedded screenshot remain directly readable. Restored raw data
is ignored by Git and all existing collectors/comparison tools use its old paths.
"""
import argparse
import gzip
import hashlib
import subprocess
import tarfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dev/log/issues/43/pulls/44'
MANIFEST = DEST / 'evidence-files.tsv'
CHECKSUMS = DEST / 'evidence.sha256'
GROUPS = {'artifacts', 'ci-logs', 'comparison', 'github', 'local', 'research', 'templates'}
VISIBLE = {'comparison/REVIEW.md', 'local/tutorial-phone-chromium.png'}


def digest(stream):
    result = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        result.update(block)
    return result.hexdigest()


def safe_name(name):
    path = PurePosixPath(name)
    if (path.is_absolute() or '..' in path.parts or not path.parts
            or path.parts[0] not in GROUPS or str(path) != name
            or any(char in name for char in '\t\r\n\\')):
        raise ValueError(f'Invalid evidence path: {name!r}')
    return path


def manifest():
    rows = {}
    for line in MANIFEST.read_text().splitlines():
        sha, size, name = line.split('\t', 2)
        safe_name(name)
        if name in rows or len(sha) != 64:
            raise ValueError(f'Invalid manifest entry: {name!r}')
        rows[name] = (sha, int(size))
    return rows


def volume(name):
    group = 'verification' if name.startswith('artifacts/final-verification/') else PurePosixPath(name).parts[0]
    return f'evidence-{group}.tar.gz'


def pack():
    tracked = subprocess.check_output(
        ['git', 'ls-files', '-z', '--', str(DEST.relative_to(ROOT))], cwd=ROOT,
    ).decode().split('\0')
    names = {str((ROOT / name).relative_to(DEST)) for name in tracked if name}
    names = {name for name in names if PurePosixPath(name).parts[0] in GROUPS}
    if MANIFEST.exists():
        names.update(manifest())
    # Include final-head verification collected after the last evidence commit.
    final = DEST / 'artifacts/final-verification'
    names.update(str(path.relative_to(DEST)) for path in final.rglob('*') if path.is_file())
    names.difference_update(VISIBLE)
    rows = []
    volumes = sorted({volume(name) for name in names})
    for filename in volumes:
        with (DEST / filename).open('wb') as target:
            with gzip.GzipFile(fileobj=target, mode='wb', filename='', mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode='w|') as archive:
                    for name in sorted(name for name in names if volume(name) == filename):
                        safe_name(name)
                        path = DEST / name
                        if path.is_symlink() or not path.is_file():
                            raise ValueError(f'Missing or nonregular evidence: {name}')
                        with path.open('rb') as source:
                            sha = digest(source)
                            source.seek(0)
                            info = tarfile.TarInfo(name)
                            info.size = path.stat().st_size
                            info.mode = 0o755 if path.stat().st_mode & 0o100 else 0o644
                            archive.addfile(info, source)
                        rows.append(f'{sha}\t{info.size}\t{name}\n')
        if (DEST / filename).stat().st_size >= 50 * 1024 * 1024:
            raise ValueError(f'Volume exceeds GitHub recommended file size: {filename}')
    MANIFEST.write_text(''.join(rows))
    checksums = []
    for path in [DEST / name for name in volumes] + [MANIFEST]:
        with path.open('rb') as source:
            checksums.append(f'{digest(source)}  {path.name}\n')
    CHECKSUMS.write_text(''.join(checksums))
    verify()


def verify(restore=False):
    remaining = manifest()
    volumes = sorted({volume(name) for name in remaining})
    expected_files = {*volumes, MANIFEST.name}
    for line in CHECKSUMS.read_text().splitlines():
        sha, name = line.split(maxsplit=1)
        if name not in expected_files:
            raise ValueError(f'Unexpected checksum target: {name}')
        expected_files.remove(name)
        with (DEST / name).open('rb') as source:
            if digest(source) != sha:
                raise ValueError(f'Checksum mismatch: {name}')
    if expected_files:
        raise ValueError('Incomplete archive checksums')
    count, total = len(remaining), sum(size for _, size in remaining.values())
    for filename in volumes:
        with tarfile.open(DEST / filename, mode='r|gz') as archive:
            for member in archive:
                name = member.name
                safe_name(name)
                if not member.isfile() or name not in remaining or volume(name) != filename:
                    raise ValueError(f'Unexpected archive member: {name}')
                sha, size = remaining.pop(name)
                if member.size != size:
                    raise ValueError(f'Size mismatch: {name}')
                with archive.extractfile(member) as source:
                    if digest(source) != sha:
                        raise ValueError(f'Content mismatch: {name}')
    if remaining:
        raise ValueError('Archive is missing manifest entries')
    if restore:
        # Verify every byte before writing; never extract links, execute a
        # downloaded script, or overwrite locally changed investigation data.
        rows = manifest()
        for filename in volumes:
            with tarfile.open(DEST / filename, mode='r|gz') as archive:
                for member in archive:
                    target = DEST / member.name
                    if not target.resolve().is_relative_to(DEST.resolve()):
                        raise ValueError(f'Path escapes evidence directory: {member.name}')
                    if target.exists():
                        with target.open('rb') as source:
                            if digest(source) != rows[member.name][0]:
                                raise ValueError(f'Refusing to overwrite changed evidence: {member.name}')
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, target.open('xb') as output:
                        for block in iter(lambda: source.read(1024 * 1024), b''):
                            output.write(block)
                    target.chmod(member.mode & 0o777)
    print(f'{"Restored" if restore else "Verified"} {count} evidence files ({total} bytes); exact SHA-256/size coverage')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['pack', 'verify', 'restore'])
    command = parser.parse_args().command
    if command == 'pack':
        pack()
    else:
        verify(restore=command == 'restore')
