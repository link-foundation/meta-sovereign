"""Hosted-only exact-parent CLI regression, reusing the existing Cargo cache."""
from pathlib import Path
import os
import subprocess
import tarfile
import tempfile

root = Path(__file__).resolve().parents[2]
if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Run this full native build on a provisioned hosted CI runner.')
revision = '0f245481b247bdbbf622127deecd97fd095ddb8e'
logs = root / 'ci-logs'
logs.mkdir(exist_ok=True)
with (logs / 'native-storage-parent-compile.log').open('w') as log:
    if subprocess.run(['git', 'cat-file', '-e', revision], cwd=root,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        subprocess.run(['git', 'fetch', '--no-tags', '--depth=1', 'origin', revision],
                       cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)
    with tempfile.TemporaryDirectory(prefix='native-parent-', dir=root / 'experiments/issue-56') as directory:
        work = Path(directory)
        archive = work / 'parent.tar'
        with archive.open('wb') as output:
            subprocess.run(['git', 'archive', revision, 'rust'], cwd=root, stdout=output, check=True)
        with tarfile.open(archive) as source:
            source.extractall(work, filter='data')
        target = root / 'rust/target'
        subprocess.run(['cargo', 'build', '--manifest-path', str(work / 'rust/Cargo.toml'),
                        '--target-dir', str(target), '-j', '1', '-p', 'meta-sovereign-server',
                        '--bin', 'meta-sovereign-rs'], cwd=root,
                       stdout=log, stderr=subprocess.STDOUT, check=True)
        result = subprocess.run(['node', 'experiments/issue-56/native-durable-interop.mjs',
                                 str(target / 'debug/meta-sovereign-rs')], cwd=root,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (logs / 'native-storage-parent.log').write_text(result.stdout)
        assert result.returncode != 0, result.stdout
        assert 'acknowledged owner write survives process termination' in result.stdout, result.stdout
        assert '404 !== 200' in result.stdout, result.stdout
        print(f'Exact parent {revision}: acknowledged write is missing after restart (expected failure).')
        print(result.stdout)
