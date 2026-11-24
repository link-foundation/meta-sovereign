"""Finite pre-fix regression replay; always restore the current sender source."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/sources/telegram-send.js'
mode = sys.argv[1] if len(sys.argv) > 1 else 'test'
files = [source]
if mode == 'ui-test':
    files += [root / 'js/src/web' / f'{name}.js' for name in ['chat-failure', 'chat-message', 'chat-message-meta', 'chat-list', 'chat-pending-preview']]
saved = {file: file.read_bytes() for file in files}
commands = {
    'test': ['node', '--test', '--test-concurrency=1', '--test-timeout=10000', 'js/tests/telegram-text-receipts.test.js'],
    'browser': ['node', 'js/tests/e2e-telegram-text-receipts-browser.mjs'],
    'ui': ['node', 'experiments/issue-56/telegram-text-receipts-ui.mjs'],
    'ui-test': ['node', '--test', '--test-concurrency=1', '--test-timeout=10000', 'js/tests/chat-failure.test.js'],
}
if mode not in commands:
    raise SystemExit('Choose test, browser, ui-test or ui')
env = {**os.environ, 'RUN_BROWSER_E2E': '1', 'E2E_BROWSER': 'chromium', 'E2E_EXECUTABLE_PATH': '/opt/google/chrome/chrome'}
try:
    for file in files:
        file.write_bytes(subprocess.check_output(['git', 'show', f'f5091260:{file.relative_to(root)}'], cwd=root))
    result = subprocess.run(commands[mode], cwd=root, env=env)
    print(f'Pre-fix {mode} exit: {result.returncode}', flush=True)
finally:
    for file, data in saved.items():
        file.write_bytes(data)
