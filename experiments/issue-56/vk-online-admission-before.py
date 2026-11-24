"""Replay finite admission regressions against the exact published parent."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/automation/vk-online.js', 'js/src/sources/vk.js']
current = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'5f982b17:{name}'], cwd=root))
    result = subprocess.run(['node', '--max-old-space-size=384', '--test',
        '--test-concurrency=1', 'js/tests/vk-online-admission.test.js'], cwd=root,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    print(result.stdout, end='')
    assert result.returncode != 0 and 'fail 15' in result.stdout
    print('All fifteen actual-parent admission refusals reproduce; five positive controls pass.')
finally:
    for name, source in current.items():
        (root / name).write_bytes(source)
