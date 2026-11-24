"""Reproduce the generated MCP fixture regression, then restore its source."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'experiments/issue-56/application-chats-mcp.mjs'
saved = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', '8250c313:experiments/issue-56/application-chats-mcp.mjs'],
        cwd=root))
    log_path = root / 'ci-logs/application-chats-codeql-before.log'
    with log_path.open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=application chat MCP metadata',
            'js/tests/mcp-inspection-code.test.js'], cwd=root, stdout=log,
            stderr=subprocess.STDOUT,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode == 1, result.returncode
    assert 'fail 1' in log_path.read_text()
finally:
    path.write_bytes(saved)
print('Parent generated-code escaping regression failed; source restored.')
