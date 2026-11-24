"""Reproduce the hosted self-repository finding in a finite temporary fixture."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
scanner = os.environ.get('ZIZMOR', 'zizmor')
before = '--before' in sys.argv
with tempfile.TemporaryDirectory(prefix='issue-56-audit-') as fixture:
    directory = Path(fixture) / '.github'
    shutil.copytree(root / '.github', directory)
    if before:
        (directory / 'workflows/release.yml').write_bytes(subprocess.check_output(
            ['git', 'show', 'ea0c506e:.github/workflows/release.yml'], cwd=root))
    result = subprocess.run(
        [scanner, '--offline', '--format', 'plain', '.github'], cwd=fixture,
        env={**os.environ, 'RUST_LOG': 'info'}, check=False)
    sys.exit(result.returncode)
