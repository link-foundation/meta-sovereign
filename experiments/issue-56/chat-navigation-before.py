"""Exercise the actual preceding sender/scanner and restore every working source."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'eca91d6b50955b89c02c43d105c8090d32a4c7af'
names = ['js/src/sources/browser-sender.js', 'js/src/sources/browser-chat-scan.js']
saved = {name: (root / name).read_bytes() for name in names}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/chat-navigation-before-test.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-name-pattern=unread passes require',
                                 'js/tests/browser-unread-conversations.test.js'], cwd=root, env=env, stdout=log, stderr=log)
    assert result.returncode == 1
    with (root / 'ci-logs/chat-navigation-before-browser.log').open('w') as log:
        result = subprocess.run(['node', 'experiments/issue-56/chat-navigation-browser.mjs', '--before'],
                                cwd=root, env=env, stdout=log, stderr=log)
    assert result.returncode == 0
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
    print('Both working sources restored')
