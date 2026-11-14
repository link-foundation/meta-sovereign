"""Reproduce finite parent planner/UI failures, restoring every source in finally."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '7034426b14f6e79e3d6cb966141b19cb4f1da045'
names = (root / 'ci-logs/chat-model-changed-code.txt').read_text().splitlines()
names = [name for name in names if name.startswith('js/src/')]
names.append('js/src/web/app.min.js')
original = {}
for name in names:
    result = subprocess.run(['git', 'show', f'{parent}:{name}'], cwd=root, capture_output=True)
    if result.returncode == 0:
        original[name] = result.stdout
saved = {name: (root / name).read_bytes() for name in original}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name, content in original.items():
        (root / name).write_bytes(content)
    with (root / 'ci-logs/chat-model-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-name-pattern=opt-in persists|mixed preview|latest consecutive|wholly unanswered',
            'js/tests/chat-answer-model.test.js'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0
    text = (root / 'ci-logs/chat-model-before.log').read_text()
    assert 'fail 4' in text
    browser_env = {**env, 'RUN_BROWSER_E2E': '1', 'CHAT_MODEL_BEFORE': '1',
        'E2E_EXECUTABLE_PATH': '/opt/google/chrome/chrome'}
    with (root / 'ci-logs/chat-model-browser-before.log').open('w') as log:
        browser = subprocess.run(['node', 'js/tests/e2e-chat-model-browser.mjs'],
            cwd=root, env=browser_env, stdout=log, stderr=subprocess.STDOUT)
    assert browser.returncode != 0
    assert 'model drafts the unanswered part' in (root / 'ci-logs/chat-model-browser-before.log').read_text()
    print('Four parent regressions and the production UI fail; current sources restored.')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
