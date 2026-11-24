"""Finite failing-before probe for disk-flush and preview-dismissal protections."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
probes = [
    ('flush', 'js/src/sources/telegram-follow-journal.js',
     lambda text: text.replace('    await env.store.flush?.();\n', '').replace('      await env.store.flush?.();\n', ''),
     'intent flush failures'),
    ('dismissal', 'js/src/sources/telegram-follow-runtime.js',
     lambda text: text[:text.index('      if (body?.planId !== undefined)')] + text[text.index('      revision += 1;'):],
     'scoped dismissal'),
]
for name, file, mutate, pattern in probes:
    path = root / file
    original = path.read_text()
    try:
        path.write_text(mutate(original))
        with (root / f'ci-logs/follow-telegram-before-{name}.log').open('w') as log:
            result = subprocess.run(['node', '--test', '--test-concurrency=1', '--test-timeout=15000', f'--test-name-pattern={pattern}', 'js/tests/follow-telegram.test.js'], cwd=root, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode == 0:
            raise RuntimeError(f'{name}: expected regression failure')
    finally:
        path.write_text(original)
print('Both finite before probes failed as expected; corrected sources restored.')
