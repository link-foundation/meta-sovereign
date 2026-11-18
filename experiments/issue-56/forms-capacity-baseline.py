"""Run two bounded regressions against the preceding implementation."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
files = ['js/src/forms/review-sessions.js', 'js/src/cli/forms-review-commands.js']
saved = {name: (root / name).read_bytes() for name in files}
try:
    for name in files:
        old = subprocess.check_output(['git', 'show', f'48278460:{name}'], cwd=root)
        (root / name).write_bytes(old)
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
    log = root / 'ci-logs/forms-capacity-before.log'
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=seventeen|one CLI invocation accepts five',
            'js/tests/forms-review-capacity.test.js',
        ], cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, check=False)
    assert result.returncode != 0, 'the original capacity restrictions must fail'
    text = log.read_text()
    assert 'Review one to four form URLs' in text
    assert 'Use finite form review limits' in text
    print('Reproduced both original capacity restrictions; current sources restored.')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
