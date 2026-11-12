"""Stage verified case-study evidence, source snapshots and screenshot hashes."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import tarfile


def evidence_context(script, prefix):
    """Share root-relative log reads across the finite evidence collectors."""
    root = Path(script).resolve().parents[2]
    logs = root / 'ci-logs'
    def read(name):
        return (logs / f'{prefix}-{name}.log').read_text()
    return root, logs, read


def changed_sources(root, revision=None):
    """Capture the same working sources without recursively archiving evidence."""
    changed = subprocess.check_output([
        'git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
        cwd=root).decode().split('\0')
    changed += subprocess.check_output([
        'git', 'diff', '--name-only', '-z', *([revision] if revision else ['--cached'])],
        cwd=root).decode().split('\0')
    return sorted(set(name for name in changed if name and not name.startswith(
        'docs/case-studies/issue-56/data/')))


def evidence_logs(root, prefix, suffixes=('.log', '.json')):
    return [str(path.relative_to(root)) for path in (root / 'ci-logs').glob(f'{prefix}-*')
            if path.is_file() and path.suffix in suffixes
            and not path.name.endswith(('-commit.log', '-push.log', '-archive.log', '-pr.log'))]


def bundle(root, sources, destination, metadata, screenshot_pattern, before=None):
    root = Path(root)
    helper = 'experiments/issue-56/evidence_bundle.py'
    archiver = 'experiments/issue-56/archive-evidence.py'
    metadata = dict(metadata, screenshots={
        image.name: hashlib.sha256(image.read_bytes()).hexdigest()
        for image in sorted((root / 'docs/screenshots').glob(screenshot_pattern))
    })
    write_archive = runpy.run_path(str(root / archiver))['archive']
    with tempfile.TemporaryDirectory(prefix='issue-56-evidence-') as temporary:
        stage = Path(temporary)
        for name in dict.fromkeys([*sources, helper, archiver]):
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / name, target)
        for name, revision in (before or {}).items():
            target = stage / 'before' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(subprocess.check_output(
                ['git', 'show', f'{revision}:{name}'], cwd=root))
        (stage / 'metadata.json').write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
        write_archive(stage, root / destination)


def write_hashed_archive(root, archive, names, metadata, source_count):
    """Write deterministic named evidence and verify every archived byte."""
    with archive.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as tar:
                for name in sorted(set(names)):
                    data = (root / name).read_bytes()
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    tar.addfile(entry, io.BytesIO(data))
                payload = (json.dumps(metadata, indent=2) + '\n').encode()
                entry = tarfile.TarInfo('metadata.json')
                entry.size = len(payload)
                tar.addfile(entry, io.BytesIO(payload))
    with tarfile.open(archive, 'r:gz') as tar:
        hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest()
                  for entry in tar.getmembers() if entry.isfile()}
    assert set(hashes) == set(names) | {'metadata.json'}
    for name in names:
        assert hashes[name] == hashlib.sha256((root / name).read_bytes()).hexdigest()
    archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
        json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
    print(f'Verified {len(hashes)} archive entries and {source_count} source hashes')
