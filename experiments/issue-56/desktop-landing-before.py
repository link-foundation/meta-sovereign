"""Run the three focused regressions against the exact published parent."""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
PARENT = '745766488c2c1c6e1773546d9d0a4175a8b28aa0'
FILES = [ROOT / 'js/src/web/download' / name
         for name in ['downloads.js', 'model.js', 'page.js']]
saved = {file: file.read_bytes() for file in FILES}
try:
    for file in FILES:
        file.write_bytes(subprocess.check_output(
            ['git', 'show', f'{PARENT}:{file.relative_to(ROOT)}'], cwd=ROOT))
    result = subprocess.run([
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        'js/tests/desktop-landing-availability.test.js',
    ], cwd=ROOT, check=False)
    if result.returncode != 1:
        raise SystemExit(f'Expected three parent regressions, exit={result.returncode}')
finally:
    for file, data in saved.items():
        file.write_bytes(data)
