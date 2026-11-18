"""Reproduce native-export control rendering through a temp-directory alias."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
test = root / 'js/tests/cv-publication-exports.test.js'
saved = test.read_bytes()
try:
    if '--before' in sys.argv:
        test.write_bytes(subprocess.check_output([
            'git', 'show', '74576648:js/tests/cv-publication-exports.test.js'], cwd=root))
    with tempfile.TemporaryDirectory(prefix='ms-cv-alias-') as temporary:
        folder = Path(temporary)
        (folder / 'actual').mkdir()
        (folder / 'alias').symlink_to(folder / 'actual', target_is_directory=True)
        env = {**os.environ, 'TMPDIR': str(folder / 'alias')}
        result = subprocess.run([
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=native export source and consent',
            'js/tests/cv-publication-exports.test.js'], cwd=root, env=env, check=False)
        expected = 1 if '--before' in sys.argv else 0
        if result.returncode != expected:
            raise SystemExit(f'Expected exit {expected}, got {result.returncode}')
finally:
    test.write_bytes(saved)
