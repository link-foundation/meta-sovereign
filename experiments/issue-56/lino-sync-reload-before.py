"""Reproduce the hosted read during a finite real-document reload gap."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
target = root / 'js/tests/e2e-lino-sync.mjs'
original = target.read_bytes()
parent = '2389fc8e2e3c8ae72277d0becc720dd56c6b06f5'
source = subprocess.check_output(['git', 'show', f'{parent}:js/tests/e2e-lino-sync.mjs'], cwd=root).decode()
source = "import { reloadSyncPeer, holdSyncDiscovery } from './helpers/e2e-lino-sync-read.mjs';\n" + source
setup = '  const traces = [];\n  try {\n'
assert source.count(setup) == 1
source = source.replace(setup, setup + '    const releaseDiscovery = await holdSyncDiscovery(other);\n')
anchor = "    await until(\n"
assert source.count(anchor) == 2
source = source.replace(anchor, '    await reloadSyncPeer(other, releaseDiscovery);\n' + anchor, 1)
environment = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
                   RUN_BROWSER_E2E='1', E2E_BROWSER='webkit', CI_LINO_SYNC_DEBUG='1')
log = root / 'ci-logs/lino-sync-reload-before.log'
try:
    target.write_text(source)
    with log.open('w') as output:
        result = subprocess.run(['node', str(target)], cwd=root, env=environment,
                                stdout=output, stderr=subprocess.STDOUT)
    evidence = log.read_text()
    assert result.returncode != 0, 'Parent unexpectedly passed'
    assert '[sync-reload] new document has no API' in evidence
    assert 'globalThis.__msApi.get' in evidence
    print('Expected actual-parent read failure during real document reload')
finally:
    target.write_bytes(original)
