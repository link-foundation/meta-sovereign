"""Replay a reset from the exact published navigation-route callback."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/tests/helpers/e2e-sync-peer.mjs'
path = root / name
saved = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output(['git', 'show', f'd6841cad:{name}'], cwd=root))
    with (root / 'ci-logs/sync-fixture-bundle-before.log').open('w') as output:
        result = subprocess.run(['node', '--max-old-space-size=384', '--test',
                                 '--test-concurrency=1', '--test-name-pattern=WebKit sync preparation',
                                 'js/tests/sync-fixture-bundle.test.js'], cwd=root,
                                stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
    assert 'route.fetch: read ECONNRESET' in (root / 'ci-logs/sync-fixture-bundle-before.log').read_text()
    print('Exact published callback exposes the injected upstream reset.')
finally:
    path.write_bytes(saved)
    print('Restored the current sync-peer helper.')
