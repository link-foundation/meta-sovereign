"""Reproduce two finite recovery defects by temporarily removing their guards."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/assignments/publish.js'
original = source.read_text()
probe = original.replace('  assertPendingDraft(previous, draft);\n', '')
probe = probe.replace('  (ledger?.repository && receipt.id !== ledger.repository.id) ||\n', '')
assert probe != original
try:
    source.write_text(probe)
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=different saved draft|recreated under the same name',
        'js/tests/assignment-publisher.test.js',
    ], cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    log = root / 'ci-logs/assignment-publication-recovery-before.log'
    log.write_text(result.stdout)
    assert result.returncode == 1, result.returncode
    assert 'fail 2' in result.stdout, result.stdout[-2000:]
    print('Both recovery regressions fail without the guards; source restored.')
finally:
    source.write_text(original)
