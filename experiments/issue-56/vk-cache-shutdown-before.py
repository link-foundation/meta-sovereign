"""Finite regression: omit only cache task ownership from server shutdown."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/server/runtime-lifecycle.js'
original = source.read_bytes()
needle = b'      ctx.vkCache?.close(),\n'
assert original.count(needle) == 1
try:
    source.write_bytes(original.replace(needle, b''))
    with (root / 'ci-logs/vk-cache-shutdown-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=server shutdown drains',
            'js/tests/vk-cache-interfaces.test.js',
        ], cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    evidence = (root / 'ci-logs/vk-cache-shutdown-before.log').read_text()
    assert 'true !== false' in evidence and 'fail 1' in evidence
finally:
    source.write_bytes(original)
