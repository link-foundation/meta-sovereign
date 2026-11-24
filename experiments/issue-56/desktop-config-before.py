"""Run the finite desktop dispatch regression against its actual published parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/electron/main.js', 'js/scripts/prepare-desktop.mjs']
current = {name: (root / name).read_bytes() for name in names}
log = root / 'ci-logs/desktop-config-before.log'
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'425e6ce6:{name}'], cwd=root))
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-reporter=tap', '--test-concurrency=1',
            '--test-name-pattern=actual desktop startup passes layered values',
            'js/tests/desktop-configuration.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    content = log.read_text()
    assert result.returncode == 1 and '# fail 1' in content
    assert '9001' in content and 'actual: 0' in content
    assert 'ERR_MODULE_NOT_FOUND' not in content and 'SyntaxError' not in content
    print('Verified ignored desktop file/CLI configuration against exact parent')
    packaging_log = root / 'ci-logs/desktop-config-packaging-before.log'
    with packaging_log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-reporter=tap', '--test-concurrency=1',
            '--test-name-pattern=ships the root version and production runtime dependencies',
            'js/tests/desktop-packaging.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    content = packaging_log.read_text()
    assert result.returncode == 1 and '# fail 1' in content
    assert 'lino-objects-codec' in content and 'lino-arguments' in content
    print('Verified missing staged production dependencies against exact parent')
finally:
    for name, content in current.items():
        (root / name).write_bytes(content)
