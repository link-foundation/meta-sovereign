"""Replay the actual startup graph before consumer deferral, without a worker."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
targets = [
    'js/src/cli/server-options.js',
    'js/src/storage/recovery-settings.js',
    'js/src/storage/recovery-dump.js',
    'js/src/server/rolling-supervisor.js',
    'js/src/server/worker-proxy.js',
    'js/src/server/cors.js',
    'js/src/server/hosted-ui.js',
    'js/src/web/discover.js',
    'js/src/cli/serve-command.js',
]
originals = {name: (root / name).read_bytes() for name in targets}
try:
    for name in targets:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'024745f1:{name}'], cwd=root))
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
    with (root / 'ci-logs/rolling-consumer-admission-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            'js/tests/cli-startup-imports.test.js',
        ], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'published startup unexpectedly deferred consumers'
    with (root / 'ci-logs/rolling-consumer-imports-before.json').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/cli-serve-imports.mjs'],
                       cwd=root, env=env, stdout=log, check=True)
    print('Published startup graph refuses the new assertion; version control retained.')
finally:
    for name, content in originals.items():
        (root / name).write_bytes(content)
