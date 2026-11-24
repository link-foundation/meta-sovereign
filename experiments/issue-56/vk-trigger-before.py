"""Bounded actual-parent duplicate and server drain regressions."""
from pathlib import Path
import os
import subprocess
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
verify_parent(root, '2798951cb62454a0e9e400a75649fa492d7911d7',
              'vk-trigger', 'js/tests/automation-trigger-state.test.js',
              pattern='duplicate concurrent live updates')
source = root / 'js/src/server/index.js'
current = source.read_text()
assert current.count('await scheduler.stop();') == 1
try:
    source.write_text(current.replace('await scheduler.stop();', 'scheduler.stop();'))
    with (root / 'ci-logs/vk-trigger-shutdown-before.log').open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
            'js/tests/automation-server-drain.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT, check=False)
    assert result.returncode == 1, result.returncode
finally:
    source.write_text(current)
