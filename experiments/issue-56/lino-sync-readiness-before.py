"""Interrupt one discovery probe in the actual parent sync test; always restore."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/tests/e2e-lino-sync.mjs'
original = source.read_bytes()
parent = subprocess.check_output([
    'git', 'show', '2fb595e1:js/tests/e2e-lino-sync.mjs'], cwd=root).decode()
current = original.decode()
start = current.index('  // Exercise the production offline')
end = current.index('  const targets = [page, other];', start)
fault = current[start:end]
assert parent.count('  const targets = [page, other];') == 1
try:
    source.write_text(parent.replace('  const targets = [page, other];',
                                    fault + '  const targets = [page, other];'))
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
               RUN_BROWSER_E2E='1', E2E_BROWSER='webkit', CI_LINO_SYNC_DEBUG='1')
    log_path = root / 'ci-logs/lino-sync-readiness-parent-before.log'
    with log_path.open('w') as log:
        result = subprocess.run(['node', str(source)], cwd=root, env=env,
                                stdout=log, stderr=subprocess.STDOUT)
    text = log_path.read_text()
    assert result.returncode != 0
    assert 'rediscovery' in text and '"discovered":null' in text.replace('\\"', '"')
    assert ('Execution context was destroyed' in text or
            "undefined is not an object" in text)
    print('Expected actual-parent discovery/reload failure; existing deadlines retained.')
finally:
    source.write_bytes(original)
