"""Finite actual-parent regression; restore every file even after a probe failure."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '210ef3b0ec767b72e9f1207a968f64838e58bb75'
files = ['question-browser-review.js', 'question-browser-unread.js',
         'question-unread-answers.js', 'question-unread-polling.js']
saved = {}
try:
    for name in files:
        path = root / 'js/src/automation' / name
        saved[path] = path.read_bytes()
        path.write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{path.relative_to(root)}'], cwd=root))
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
    with (root / 'ci-logs/unread-model-before-node.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
                                 '--test-name-pattern=unread model opt-in uses',
                                 'js/tests/question-unread-model.test.js'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, 'The actual parent must fail the new regression'
    with (root / 'ci-logs/unread-model-before-browser.log').open('w') as log:
        result = subprocess.run(['node', 'experiments/issue-56/unread-model-browser.mjs', '--before'],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 0, 'The parent browser evidence probe must succeed'
finally:
    for path, content in saved.items():
        path.write_bytes(content)
print('Actual parent regression and native screenshot captured; working files restored')
