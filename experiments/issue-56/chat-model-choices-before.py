"""Prove the narrow stale-choice guard with a finite, restored-source probe."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/automation/question-chat-turn.js'
saved = source.read_bytes()
before = saved.replace(b'  options: JSON.stringify(answerOptions),\n', b'')
assert before != saved
(root / 'ci-logs/chat-model-turn-before-choices.js').write_bytes(before)
try:
    source.write_bytes(before)
    with (root / 'ci-logs/chat-model-choices-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=changed offered choices',
            'js/tests/chat-answer-model.test.js',
        ], cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
            stdout=log, stderr=subprocess.STDOUT)
    text = (root / 'ci-logs/chat-model-choices-before.log').read_text()
    assert result.returncode != 0 and "- 'answer-changed'" in text
    print('The finite stale-choice regression fails without the options binding.')
finally:
    source.write_bytes(saved)
