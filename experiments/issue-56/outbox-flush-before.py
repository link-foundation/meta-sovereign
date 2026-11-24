"""Reproduce provider dispatch before durable reservation against actual parent."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/automation/outbox.js'
current = source.read_bytes()
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', 'ea8d7eae:js/src/automation/outbox.js'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-timeout=10000',
        'js/tests/question-outbox-flush.test.js',
    ], cwd=root, capture_output=True, text=True)
    log = result.stdout + result.stderr
    (root / 'ci-logs/outbox-flush-parent-node.log').write_text(log)
    assert result.returncode != 0, log
    assert 'fail 2' in log, log
    print('PASS: actual parent dispatches without flushing and after a failed flush')
finally:
    source.write_bytes(current)
