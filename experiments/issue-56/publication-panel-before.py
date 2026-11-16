"""Replay the actual published broad-selector failure, then restore both helpers."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '9d31c3e71cd811371f91cbe0a33b193c5a518039'
names = ['js/tests/helpers/e2e-cv-publication.mjs',
         'js/tests/helpers/e2e-cv-publication-exports.mjs']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    environment = dict(os.environ, RUN_BROWSER_E2E='1')
    result = subprocess.run(
        ['node', '--max-old-space-size=384',
         'js/tests/e2e-cv-publication-browser.mjs'], cwd=root,
        env=environment, capture_output=True)
    output = result.stdout + result.stderr
    (root / 'ci-logs/publication-panel-before.log').write_bytes(output)
    assert result.returncode == 1, result.returncode
    assert b'strict mode violation' in output and b'resolved to 2 elements' in output
    print('Published parent reproduces the two-panel strict-selector failure.')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
