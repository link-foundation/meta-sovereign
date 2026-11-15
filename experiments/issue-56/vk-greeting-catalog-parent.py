"""Finite parent regressions, restoring only this unit's source files."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PARENT = '0a6283651778b914102c6ddb49a19d29cbf80070'
FILES = ['js/src/greetings/plan.js', 'js/src/greetings/index.js',
         'js/src/cli/greetings-commands.js', 'js/src/web/greetings-view.js']
saved = {name: (ROOT / name).read_bytes() for name in FILES}
try:
    for name in FILES:
        (ROOT / name).write_bytes(subprocess.check_output(['git', 'show', f'{PARENT}:{name}'], cwd=ROOT))
    result = subprocess.run(['node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
                             'js/tests/vk-greeting-catalog.test.js'], cwd=ROOT, check=False)
    assert result.returncode == 1, 'Parent must fail the regression checks'
finally:
    for name, value in saved.items():
        (ROOT / name).write_bytes(value)
    print('Restored all actual-parent comparison sources.')
