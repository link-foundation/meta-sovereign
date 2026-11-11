"""Reproduce two lost CLI output cases, then restore the working entry point."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
entry = root / 'js/bin/meta-sovereign.js'
original = entry.read_bytes()
try:
    entry.write_bytes(subprocess.check_output([
        'git', 'show', '2329461bb6fb7dd0f18d104728735967a70cdd83:js/bin/meta-sovereign.js',
    ], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-timeout=15000',
        'js/tests/cli-output.test.js',
    ], cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (root / 'ci-logs/cli-output-before-two.log').write_text(result.stdout)
    assert result.returncode == 1 and 'fail 2' in result.stdout, result.stdout[-2000:]
    print('Two output regressions fail on the parent; entry point restored.')
finally:
    entry.write_bytes(original)
