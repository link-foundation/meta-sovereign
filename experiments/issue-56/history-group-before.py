"""Reproduce missing and duplicate history registration, restoring current files."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '4c58bbb19deead3d3fd2c349ec825012bf1d3a33'
names = ['package.json', 'js/scripts/browser-checks.json',
         'js/tests/e2e-question-chat-lists-browser.mjs']
saved = {name: (root / name).read_bytes() for name in names}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}


def failed(suffix, reason):
    target = root / f'ci-logs/ci-question-history-{suffix}.log'
    with target.open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=30000',
            '--test-name-pattern=question provider and control scenarios',
            'js/tests/ci-contracts.test.js',
        ], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1 and reason in target.read_text()


try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    failed('before', 'AssertionError [ERR_ASSERTION]: question-history')
    for name in names[:2]:
        (root / name).write_bytes(saved[name])
    failed('overlap-before', 'verifyConversationHistory runs in exactly one bounded group')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
print('Both history registration regressions fail before correction; sources restored.')
