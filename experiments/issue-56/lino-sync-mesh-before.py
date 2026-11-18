"""Replay the bounded native mesh regression against the actual parent bundle."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/web/app.min.js', 'js/src/sync/webrtc-signaling.js',
         'js/src/sync/bun-server.js']
originals = {name: (root / name).read_bytes() for name in names}
environment = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
                   RUN_BROWSER_E2E='1', E2E_BROWSER='webkit')
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output([
            'git', 'show', f'3483c8b1:{name}'], cwd=root))
    result = subprocess.run(['node', 'js/tests/e2e-lino-sync.mjs'],
                            cwd=root, env=environment, capture_output=True, text=True)
    log = root / 'ci-logs/lino-sync-mesh-before-native.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0, 'actual parent unexpectedly passed'
    assert 'three peers retain distinct data channels' in log.read_text()
    print('Expected actual-parent three-peer convergence failure reproduced')
finally:
    for name, data in originals.items():
        (root / name).write_bytes(data)
