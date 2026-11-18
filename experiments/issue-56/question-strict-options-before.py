"""Finite regression against the unchanged parent; always restore current sources."""
from pathlib import Path
import subprocess

files = [
    'js/src/automation/question-answers.js',
    'js/src/automation/answer-model-preview.js',
    'js/src/automation/question-chat-turn.js',
    'js/src/automation/automations.js',
    'js/src/automation/question-store.js',
    'js/src/automation/deliver.js',
    'js/src/sources/browser-sender.js',
]
original = {name: Path(name).read_bytes() for name in files}
try:
    for name in files:
        Path(name).write_bytes(subprocess.check_output(['git', 'show', f'19605f22:{name}']))
    with open('ci-logs/question-strict-options-before.log', 'w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', 'js/tests/question-strict-options.test.js'], stdout=log, stderr=subprocess.STDOUT)
    if result.returncode == 0:
        raise SystemExit('Expected regression failures on parent')
finally:
    for name, contents in original.items():
        Path(name).write_bytes(contents)
