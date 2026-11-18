"""Replay the captured native diagnostic against the actual published helper."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/tests/helpers/vk-automation-browser.mjs'
path = root / name
saved = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output(['git', 'show', f'53a84792:{name}'], cwd=root))
    result = subprocess.run(['node', '--max-old-space-size=384', '--test',
                             '--test-concurrency=1', '--test-name-pattern=genuine webkit',
                             'js/tests/vk-automation-browser.test.js'], cwd=root, check=False)
    assert result.returncode == 1, result.returncode
finally:
    path.write_bytes(saved)
    print('Restored the actual-parent VK browser helper.')
