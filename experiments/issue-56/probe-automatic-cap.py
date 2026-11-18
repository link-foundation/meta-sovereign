"""Run the finite automatic-cap regression against the published parent."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '6f7bdd6f'
paths = [Path('js/src/automation') / f'{name}.js' for name in
         ['outbox', 'deliver', 'paced-send', 'autopilot']]
saved = {path: (root / path).read_bytes() for path in paths}
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    with (root / 'ci-logs/automatic-cap-before.log').open('wb') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=256', '--test', '--test-concurrency=1',
            'js/tests/automatic-cap.test.js',
        ], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
finally:
    for path, data in saved.items():
        (root / path).write_bytes(data)
