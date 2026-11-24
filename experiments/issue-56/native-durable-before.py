"""Hosted-only exact-parent CLI regression, reusing the existing Cargo cache."""
from pathlib import Path
import argparse
import os
import subprocess
import tarfile
import tempfile
from native_cargo_reference import build_reference
from native_parent_failure import check_parent_failure

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--sync', action='store_true')
args = parser.parse_args()
if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Run this full native build on a provisioned hosted CI runner.')
revision = ('9db8d8d97da8551b381e7655107904e07afda7d8' if args.sync
            else '0f245481b247bdbbf622127deecd97fd095ddb8e')
prefix = 'native-session-parent' if args.sync else 'native-storage-parent'
probe = 'native-sync-interop' if args.sync else 'native-durable-interop'
logs = root / 'ci-logs'
logs.mkdir(exist_ok=True)
with (logs / f'{prefix}-compile.log').open('w') as log:
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
        parent = work / 'parent-cli'
        build_reference(['cargo', 'build', '--manifest-path', str(work / 'rust/Cargo.toml'),
                        '--target-dir', str(target), '-j', '1', '-p', 'meta-sovereign-server',
                        '--bin', 'meta-sovereign-rs'], target / 'debug/meta-sovereign-rs',
                        parent, cwd=root, stdout=log, stderr=subprocess.STDOUT)
        result = subprocess.run(['node', f'experiments/issue-56/{probe}.mjs',
                                 str(parent)], cwd=root,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (logs / f'{prefix}.log').write_text(result.stdout)
        check_parent_failure(result, sync=args.sync)
        if args.sync:
            print(f'Exact parent {revision}: native reconciliation is absent (expected failure).')
        else:
            print(f'Exact parent {revision}: acknowledged write is missing after restart (expected failure).')
        print(result.stdout)
