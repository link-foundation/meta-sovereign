"""Run the polling regression against the actual parent facade, then restore it."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
target = root / 'js/src/automation/question-browser.js'
saved = target.read_bytes()
parent = 'ec871d26811be18b42ff6de892da484f10d8cdca'
try:
    target.write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{target.relative_to(root)}'], cwd=root))
    with (root / 'ci-logs/unread-polling-before-node.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
                                 '--test-name-pattern=polling owns one provider',
                                 'js/tests/question-unread-polling.test.js'], cwd=root,
                                env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
                                stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, 'The parent must fail the new polling regression'
finally:
    target.write_bytes(saved)
print('Restored the working facade after the actual-parent failure')
