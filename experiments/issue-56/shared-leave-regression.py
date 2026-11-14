"""Finite before probes; restore working sources even after a failed assertion."""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[2]
probes = [
    ('receipt', 'js/src/sources/telegram-chat-removal.js',
     lambda _: subprocess.check_output(
         ['git', 'show', '2ccb4b45:js/src/sources/telegram-chat-removal.js'],
         cwd=root).decode(),
     'unconfirmed or mismatched|failed destroy acknowledgement|acknowledged basic-group leave',
     'js/tests/telegram-chat-removal.test.js'),
    ('retry', 'js/src/sources/telegram-membership-receipt.js',
     lambda value: re.sub(
         r'client\.invoke\(request, undefined, \{\s*maxRetryCount: 0,\s*floodSleepThreshold: 0,\s*\}\)',
         'client.invoke(request)', value),
     'shared join and preference writes',
     'js/tests/telegram-membership-receipts.test.js'),
]
for name, file, mutate, pattern, test in probes:
    path = root / file
    original = path.read_text()
    try:
        changed = mutate(original)
        assert changed != original, f'{name}: probe must change the implementation'
        path.write_text(changed)
        with (root / f'ci-logs/shared-leave-before-{name}.log').open('w') as log:
            result = subprocess.run(
                ['node', '--test', '--test-concurrency=1', '--test-timeout=15000',
                 f'--test-name-pattern={pattern}', test],
                cwd=root, stdout=log, stderr=subprocess.STDOUT)
        assert result.returncode != 0, f'{name}: expected regression failure'
    finally:
        path.write_text(original)
print('Both finite before probes failed as expected; corrected sources restored.')
