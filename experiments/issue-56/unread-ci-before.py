"""Bounded exact-parent regressions; always restore the drafted production bytes."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/automation/question-browser-unread.js',
         'js/src/automation/question-unread-answers.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'5427c11e:{name}'], cwd=root))
    with (root / 'ci-logs/unread-ci-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=finite unread reviews freeze|owner answers and a closed',
            'js/tests/question-browser-unread.test.js',
            'js/tests/question-unread-answers.test.js'], cwd=root, stdout=log,
            stderr=subprocess.STDOUT,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode == 1, result.returncode
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
print('Both exact-parent regressions failed; drafted sources restored.')
