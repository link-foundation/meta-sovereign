"""Reproduce native lazy-stack getter side effects with a finite descriptor seam."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '514c524fef426b3abd0a305b59b084fe759e37cd'
for name, pattern, suffix, failure in [
    ('log-value.js', 'lazy native error stacks', 'before-node', '1 !== 0'),
    ('redact.js', 'ordinary error identity', 'before-prefix', 'true !== false'),
]:
    path = f'js/src/server/{name}'
    target = root / path
    current = target.read_bytes()
    try:
        target.write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{path}'], cwd=root))
        log = root / f'ci-logs/ci-log-getter-{suffix}.log'
        with log.open('w') as output:
            result = subprocess.run([
                'node', '--test', '--test-concurrency=1', '--test-timeout=15000',
                f'--test-name-pattern={pattern}', 'js/tests/log-error.test.js'],
                cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
                stdout=output, stderr=subprocess.STDOUT)
        text = log.read_text()
        assert result.returncode == 1 and failure in text and 'fail 1' in text
        assert 'SyntaxError' not in text
    finally:
        target.write_bytes(current)
