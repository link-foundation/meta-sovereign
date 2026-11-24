"""Finite regression: omit catalog runtime ownership, then restore it."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/server/runtime-lifecycle.js'
saved = source.read_bytes()
line = b'      ctx.vkStickers?.close(),\n'
assert line in saved
try:
    source.write_bytes(saved.replace(line, b''))
    with (root / 'ci-logs/vk-stickers-shutdown-before.log').open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
            '--test-name-pattern=server shutdown drains',
            'js/tests/vk-sticker-interfaces.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'true !== false' in (root / 'ci-logs/vk-stickers-shutdown-before.log').read_text()
finally:
    source.write_bytes(saved)
