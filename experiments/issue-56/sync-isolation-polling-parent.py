"""Replay the exact published wait with a finite inactive-frame fixture."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'js/tests/helpers/e2e-sync-receive-isolation.mjs'
original = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', f'c930cf39:{path.relative_to(root)}'], cwd=root))
    log = root / 'ci-logs/sync-isolation-ci-exact-parent.log'
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--max-old-space-size=384',
            'experiments/issue-56/sync-isolation-polling.mjs'], cwd=root,
            env=dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='webkit'),
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
    text = log.read_text()
    assert 'Timeout 5000ms exceeded' in text, text
    assert '"triggered":true,"written":true,"merged":true,"replicated":true' in text, text
    print('Exact published predicate times out after successful native convergence.')
finally:
    path.write_bytes(original)
    print('Restored the current receive-isolation helper.')
