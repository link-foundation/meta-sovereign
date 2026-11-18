"""Reproduce saved CLI model intent against the exact parent, then restore."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/cli/automation-commands.js',
         'js/src/cli/answer-model-commands.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'8250c313:{name}'], cwd=root))
    with (root / 'ci-logs/unread-cli-model-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=saved automation|configuration file',
            'js/tests/question-unread-cli-model.test.js'], cwd=root, stdout=log,
            stderr=subprocess.STDOUT,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode == 1, result.returncode
    assert 'fail 2' in (root / 'ci-logs/unread-cli-model-before.log').read_text()
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
print('Both saved-intent parent regressions failed; drafted sources restored.')
