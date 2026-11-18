"""Reproduce the hosted race with the actual old helper and one busy admission."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/tests/salary-application-batch.test.js'
file = root / name
current = file.read_text()
old = subprocess.check_output(['git', 'show', f'c3b491e3:{name}'], cwd=root, text=True)
def helper(text):
    start = text.index('const deferCurrentSalary = ')
    end = text.index('\n\ntest(', start)
    return text[start:end]
try:
    # Keep the new deterministic pre-admission refusal, restoring the old caller.
    file.write_text(current.replace(helper(current), helper(old)))
    with (root / 'ci-logs/batch-admission-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-name-pattern=a salary preservation refusal', name], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    text = Path(log.name).read_text()
    assert 'Another vacancy read owns this workspace.' in text and 'fail 1' in text
finally:
    file.write_text(current)
