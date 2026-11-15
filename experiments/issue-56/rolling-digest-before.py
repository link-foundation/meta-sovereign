"""Reproduce serialized release reads on the exact published parent."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/server/rolling-release.js'
current = source.read_bytes()
log = root / 'ci-logs/rolling-digest-before.log'
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', '65bc33ee:js/src/server/rolling-release.js'], cwd=root))
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-reporter=tap', '--test-concurrency=1',
            '--test-name-pattern=release hashing overlaps bounded reads',
            'js/tests/rolling-release-digest.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'read concurrency was 1' in log.read_text()
    print('Published parent serializes every release read; finite regression reproduced')
finally:
    source.write_bytes(current)
