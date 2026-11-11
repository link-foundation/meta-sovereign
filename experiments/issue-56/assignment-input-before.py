"""Reproduce successful-command refusal on the actual preceding command runner."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/assignments/commands.js'
current = source.read_bytes()
parent = subprocess.check_output(['git', 'show', 'f7136b1e:js/src/assignments/commands.js'], cwd=root)
try:
    source.write_bytes(parent)
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-timeout=10000',
        '--test-name-pattern=successful commands without input',
        'js/tests/assignment-command-input.test.js',
    ], cwd=root, capture_output=True, text=True)
    log = result.stdout + result.stderr
    (root / 'ci-logs/assignment-input-parent-node.log').write_text(log)
    assert result.returncode != 0, log
    assert "code: 'assignment-input'" in log, log
    assert 'closed stdin pipe' in log, log
    print('PASS: actual parent refuses an otherwise successful command after unused-stdin EPIPE')
finally:
    source.write_bytes(current)
