"""Replay the finite startup regressions against the committed pre-fix source."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
files = [root / 'js/src/sources' / f'telegram-chat-users{suffix}.js' for suffix in ['', '-runtime']]
saved = {file: file.read_bytes() for file in files}
try:
    for file in files:
        file.write_bytes(subprocess.check_output(['git', 'show', f'fccb2648:{file.relative_to(root)}'], cwd=root))
    with (root / 'ci-logs/telegram-chat-users-startup-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', 'js/tests/telegram-chat-users-startup.test.js'], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    print(f'Pre-fix regression exit: {result.returncode}')
finally:
    for file, data in saved.items():
        file.write_bytes(data)
