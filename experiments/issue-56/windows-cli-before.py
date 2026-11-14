"""Reproduce each current CI defect on parent sources, restoring them in finally."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '2efd33cda8a30457f8b4d40f1a15af8813682bea'
names = ['js/src/cli/index.js', 'js/src/cli/commands.js',
         'experiments/issue-56/clink-failure-cleanup.mjs', 'package.json',
         'experiments/issue-56/mcp-inspection-code.mjs']
saved = {name: (root / name).read_bytes() for name in names}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in names[:-1]:
        data = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
        if name.endswith('clink-failure-cleanup.mjs'):
            # A fragment and space reproduce the path/URL distinction on Linux too.
            assert b"'ms-clink-cleanup-'" in data
            data = data.replace(b"'ms-clink-cleanup-'", b"'ms-clink-# cleanup-'")
        (root / name).write_bytes(data)
    (root / names[-1]).write_text(
        'export const mcpInspectionCode = (inspect, fixture) =>\n'
        '  `async (page) => (${inspect.toString()})(page, ${JSON.stringify(fixture)})`;\n')
    tests = ['cli-startup-imports', 'clink-cleanup', 'ci-browser-shards',
             'ci-contracts', 'mcp-inspection-code']
    with (root / 'ci-logs/windows-cli-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=15000',
            '--test-name-pattern=version aliases|failed real reconnect|ordinary clink reconnect|every registered|question provider|MCP inspection',
            *[f'js/tests/{name}.test.js' for name in tests]],
            cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    text = (root / 'ci-logs/windows-cli-before.log').read_text()
    assert 'fail 6' in text, text[-500:]
    with (root / 'ci-logs/windows-cli-version-before.json').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/cli-version-imports.mjs'],
                       cwd=root, env=env, stdout=log, check=True)
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
print('Six actual-parent regressions fail; working sources restored.')
