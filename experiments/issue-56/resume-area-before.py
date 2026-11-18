"""The published parent loses area IDs; restore drafted bytes after the regression."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/jobs/resume-cv.js'
saved = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(['git', 'show', f'68bb9f09:{name}'], cwd=root))
    with (root / 'ci-logs/resume-area-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-name-pattern=area identities survive', 'js/tests/resume-area-metadata.test.js'],
            cwd=root, stdout=log, stderr=subprocess.STDOUT,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode == 1, result.returncode
    text = (root / 'ci-logs/resume-area-before.log').read_text()
    assert 'fail 1' in text and 'undefined' in text
finally:
    (root / name).write_bytes(saved)
print('Published parent loses the area ID; drafted sanitizer restored.')
