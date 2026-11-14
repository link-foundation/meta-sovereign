"""Finite exact-parent observed replacement regression; restore source bytes."""
from pathlib import Path
import os
import subprocess

name = 'js/src/storage/browser-coordination.js'
source = Path(name)
original = source.read_bytes()
try:
    source.write_bytes(subprocess.check_output(['git', 'show', '5a687049:' + name]))
    checks = {
        'unit': ['node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
                 '--test-timeout=10000', '--test-name-pattern=later observed child replacement',
                 'js/tests/browser-store-merge.test.js'],
        'native': ['node', '--max-old-space-size=384', 'js/tests/e2e-browser-merge.mjs'],
    }
    for label, command in checks.items():
        with open(f'ci-logs/tab-merge-parent-{label}.log', 'wb') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT,
                                    env=dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='webkit'))
        if result.returncode == 0:
            raise RuntimeError(f'Exact parent unexpectedly passed {label}')
        print(f'Exact parent {label} fails as expected: {result.returncode}', flush=True)
finally:
    source.write_bytes(original)
    assert source.read_bytes() == original
