"""Run the actual earlier option/scanner behavior and restore working files."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'a203a29c'
names = ['js/src/sources/browser-scan-options.js', 'js/src/sources/browser-chat-scan.js',
         'js/src/sources/browser-inactive-view.js']
saved = {name: (root / name).read_bytes() for name in names}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in names[:2]:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/chat-filter-before-test.log').open('w') as log:
        check = subprocess.run(['node', '--test', '--test-name-pattern=unread filter selection',
                                'js/tests/browser-chat-filter.test.js'], cwd=root, env=env, stdout=log, stderr=log)
    assert check.returncode == 1
    with (root / 'ci-logs/chat-filter-before-browser.log').open('w') as log:
        browser = subprocess.run(['node', 'experiments/issue-56/chat-filter-browser.mjs', '--before'],
                                 cwd=root, env=env, stdout=log, stderr=log)
    assert browser.returncode == 0
    for name in names[:2]:
        (root / name).write_bytes(saved[name])
    name = names[2]
    (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/chat-filter-inactive-before.log').open('w') as log:
        check = subprocess.run(['node', '--test', '--test-name-pattern=synchronous owned checkbox',
                                'js/tests/browser-chat-filter.test.js'], cwd=root, env=env, stdout=log, stderr=log)
    assert check.returncode == 1
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
    print('All three working sources restored')
