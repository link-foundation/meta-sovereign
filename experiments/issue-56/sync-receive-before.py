"""Replay the finite owner-edit race against the exact published browser bundle."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'js/src/web/app.min.js'
original = path.read_bytes()
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
           RUN_BROWSER_E2E='1', E2E_BROWSER='webkit')
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', 'ea957225:js/src/web/app.min.js'], cwd=root))
    result = subprocess.run(['node', 'js/tests/e2e-lino-sync.mjs'],
                            cwd=root, env=env, capture_output=True, text=True)
    log = root / 'ci-logs/sync-receive-parent-browser.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0, 'actual parent unexpectedly passed'
    assert 'owner edit survives a remote receive' in log.read_text(), log.read_text()
    print('Exact published parent loses the owner edit during remote receive')
finally:
    path.write_bytes(original)
