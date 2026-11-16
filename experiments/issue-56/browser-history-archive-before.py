"""Run bounded checkpoint/privacy regressions with exact pre-fix source bytes."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '77cf6add'
paths = [
    'js/src/automation/question-archive.js',
    'js/src/automation/question-browser-unread.js',
    'js/src/automation/question-learning.js',
    'js/src/sources/browser-conversation-history.js',
    'js/src/sources/browser-scan-options.js',
    'js/src/sources/browser-sender.js',
    'js/src/sources/browser-unread-conversations.js',
]
saved = {path: (root / path).read_bytes() for path in paths}
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    result = subprocess.run([
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=conversation checkpoints|rejected history checkpoint|unread service archives|hidden private|private continuation|archive projection',
        'js/tests/browser-conversation-history.test.js',
        'js/tests/browser-history-archive.test.js',
        'js/tests/question-learning-links.test.js',
    ], cwd=root, check=False)
    if result.returncode != 1:
        raise SystemExit(f'Expected failing parent, got {result.returncode}')
finally:
    for path, content in saved.items():
        (root / path).write_bytes(content)
