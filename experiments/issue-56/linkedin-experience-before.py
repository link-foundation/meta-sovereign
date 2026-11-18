"""The exact published parent must fail the new native acquisition regression."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/cv/index.js'
saved = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(['git', 'show', f'd00abfaf:{name}'], cwd=root))
    with (root / 'ci-logs/linkedin-export-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-name-pattern=public native LinkedIn parser', 'js/tests/cv-linkedin-experience.test.js'],
            cwd=root, stdout=log, stderr=subprocess.STDOUT,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode == 1, result.returncode
    assert 'fail 1' in (root / 'ci-logs/linkedin-export-before.log').read_text()
finally:
    (root / name).write_bytes(saved)
print('Published parent fails native acquisition; drafted facade restored.')
