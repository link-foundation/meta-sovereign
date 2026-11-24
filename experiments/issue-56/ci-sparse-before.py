"""Reproduce the missing archive exclusion against the published workflow."""
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
name = '.github/workflows/release.yml'
path = root / name
saved = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output(['git', 'show', f'06953e31:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=runtime CI retains all history',
        'js/tests/ci-filtered-checkout.test.js',
    ], cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, end='')
    assert result.returncode == 1 and 'fail 1' in result.stdout
    assert 'undefined' in result.stdout and 'false' in result.stdout
finally:
    path.write_bytes(saved)
