"""Reproduce the hosted flat-prebuild failure against the actual parent config."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'desktop/electron-builder.config.cjs'
current = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', 'fc968e1a:desktop/electron-builder.config.cjs'], cwd=root))
    with (root / 'ci-logs/desktop-native-prebuilds-before.log').open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=15000',
            'js/tests/desktop-native-prebuilds.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
finally:
    path.write_bytes(current)
print('Restored config after actual-parent native verification failures')
