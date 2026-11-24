"""Replay the offline installed-dependency regression against actual parent code."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/server/worker-client.js'
current = source.read_bytes()
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', '7ac3ac65:js/src/server/worker-client.js'], cwd=root))
    result = subprocess.run([
        'deno', 'test', '--allow-all', '--v8-flags=--max-old-space-size=384',
        '--filter=Deno workers use installed', 'js/tests/worker-client.test.js'],
        cwd=root, env=dict(os.environ), capture_output=True)
    print(result.stdout.decode(), end='')
    print(result.stderr.decode(), end='')
    assert result.returncode != 0, 'parent must reject the installed offline graph'
    assert b'--cached-only' in result.stdout + result.stderr
    print('Expected actual-parent installed-dependency failure')
finally:
    source.write_bytes(current)
