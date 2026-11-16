"""Require the published reader/parser to fail the new acquisition regressions."""
from pathlib import Path
import subprocess
import os

root = Path(__file__).resolve().parents[2]
names = ['js/src/cv/linkedin-experience-parse.js', 'js/src/cv/linkedin-experience-reader.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'8cbe939c:{name}'], cwd=root))
    with (root / 'ci-logs/linkedin-acquisition-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-name-pattern=text fallback preserves|profile About is acquired',
            'js/tests/cv-linkedin-acquisition.test.js'], cwd=root, stdout=log,
            stderr=subprocess.STDOUT, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    log = (root / 'ci-logs/linkedin-acquisition-before.log').read_text()
    assert result.returncode == 1 and 'fail 2' in log, log[-2000:]
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
print('Published parser/reader fail both regressions; drafted files restored.')
