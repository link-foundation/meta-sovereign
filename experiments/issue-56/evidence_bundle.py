"""Stage verified case-study evidence, source snapshots and screenshot hashes."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile


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
