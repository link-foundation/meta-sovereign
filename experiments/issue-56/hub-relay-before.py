"""Replay six finite hub fan-out regressions on the actual published parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/sync/peer.js', 'js/src/sync/peer-receiver.js',
         'js/src/storage/mutation.js', 'js/src/storage/universal.js',
         'js/src/storage/browser-store.js']
original = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'f4a8fac1:{name}'], cwd=root))
    for label, args in [
        ('parent', ['--test-name-pattern', 'hub fan-out|a cycle of hubs',
                    'js/tests/sync-hub-relay.test.js']),
        ('parent-network', ['js/tests/sync-hub-network.test.js']),
    ]:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', *args],
                                cwd=root, capture_output=True, text=True,
                                env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
        log = root / f'ci-logs/hub-relay-{label}.log'
        log.write_text(result.stdout + result.stderr)
        assert result.returncode != 0, f'{label}: parent unexpectedly passed'
        assert 'fail 3' in log.read_text(), log.read_text()
    print('All six finite deterministic/real-network cases fail on f4a8fac1')
finally:
    for name, data in original.items():
        (root / name).write_bytes(data)
