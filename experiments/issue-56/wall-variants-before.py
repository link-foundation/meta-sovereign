"""Finite exact-parent reproduction of the obsolete single-invitation assertion."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
path = 'js/tests/vk-wall-interfaces.test.js'
target = root / path
current = target.read_bytes()
try:
    target.write_bytes(subprocess.check_output([
        'git', 'show', f'7205a3c0c7e853a9028274721d6fb285a8ceaefb:{path}'], cwd=root))
    log = root / 'ci-logs/wall-variants-before-node.log'
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=15000',
            '--test-name-pattern=both Lino encodings', path], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    content = log.read_text()
    assert result.returncode == 1 and 'fail 1' in content
    assert 'strictEqual' in content and 'SyntaxError' not in content
finally:
    target.write_bytes(current)
