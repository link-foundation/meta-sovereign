"""Bounded regression against the committed exporter, restoring code in finally.

Only the background history reader is replaced; current parser/writers allow
the regression test to reach the missing migrated history in the baseline.
"""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
reader = root / 'js/src/sources/telegram-export-run.js'
logs = root / 'ci-logs'
baseline = 'f42c4c46ce23e3d9c80b0cd396ba5a4ec0148d8b'
command = ['node', '--test', '--test-concurrency=1',
           '--test-name-pattern=all-history export includes the old basic group',
           'js/tests/telegram-export-window.test.js']
original = reader.read_bytes()
try:
    reader.write_bytes(subprocess.check_output(
        ['git', 'show', f'{baseline}:js/src/sources/telegram-export-run.js'], cwd=root))
    with (logs / 'telegram-export-migration-before.log').open('w') as output:
        before = subprocess.run(command, cwd=root, stdout=output, stderr=subprocess.STDOUT)
finally:
    reader.write_bytes(original)
with (logs / 'telegram-export-migration-after.log').open('w') as output:
    after = subprocess.run(command, cwd=root, stdout=output, stderr=subprocess.STDOUT)
assert before.returncode != 0, 'Baseline unexpectedly passed'
assert after.returncode == 0, 'Current reader did not pass'
print(f'PASS: baseline {before.returncode}; current {after.returncode}; reader restored')
