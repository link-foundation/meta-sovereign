"""Run the parent's 30 ms assertion with a finite delay and explicit cleanup."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
test = root / 'js/tests/server-sync.test.js'
original = test.read_bytes()
parent = subprocess.check_output([
    'git', 'show', 'ef99739ba4f2684d7714c456f794caa004dbe41c:js/tests/server-sync.test.js'],
    cwd=root).decode()
parent = parent.replace("test('main server exposes /rtc signaling broker', async () => {",
                        "test('main server exposes /rtc signaling broker', { timeout: 5000 }, async (t) => {")
# Keep the failed parent's actual fixed sleep/assertion, adding cleanup only.
parent = parent.replace('  const seen = [];', '''  t.after(async () => {
    await a.close();
    await b.close();
    await handle.close();
  });
  const seen = [];''', 1)
path = root / 'ci-logs/ci-signaling-delivery-before.log'
try:
    test.write_text(parent)
    with path.open('w') as log:
        result = subprocess.run([
            'deno', 'test', '--allow-all', '--filter=main server exposes /rtc signaling broker',
            'experiments/issue-56/signaling-delivery-probe.mjs'], cwd=root,
            env=dict(os.environ, NO_COLOR='1'), stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0 and 'assert.ok(seen.some' in path.read_text(), path.read_text()
finally:
    test.write_bytes(original)
assert test.read_bytes() == original
print('Parent assertion failed under bounded delayed delivery; sources restored and sockets drained.')
