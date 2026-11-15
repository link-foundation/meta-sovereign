"""One finite actual-parent comparison; restore all replaced sources on exit."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = '727e361a8c318a39bc8e23941a5bc41a80445f13'
names = ['js/src/automation/automations.js', 'js/src/automation/runner.js',
         'js/src/automation/deliver.js', 'js/src/automation/drafts.js',
         'js/src/automation/record-outcome.js', 'js/src/automation/run-automation.js',
         'js/src/crm/reengage.js', 'js/src/sources/browser-sender.js',
         'js/src/web/app.min.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    if '--browser' in sys.argv:
        command = ['node', '--max-old-space-size=384', 'experiments/issue-56/vk-gratitude-browser.mjs', '--before']
        expected = 0
    else:
        command = ['node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
                   '--test-name-pattern=preset plans only', 'js/tests/vk-gratitude.test.js']
        expected = 1
    result = subprocess.run(command, cwd=root, check=False)
    assert result.returncode == expected, f'Expected {expected}, got {result.returncode}'
finally:
    for name, value in saved.items():
        (root / name).write_bytes(value)
    print('Restored all actual-parent comparison sources.')
