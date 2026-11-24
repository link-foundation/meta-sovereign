"""Run the bounded native regression against the exact published parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '1ea671cf39f59b6652f844ba6293d48316faab1d'
source = 'js/src/web/chat-list-window.js'
bundle = 'js/src/web/app.min.js'
saved = {name: (root / name).read_bytes() for name in (source, bundle)}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
           RUN_BROWSER_E2E='1', E2E_BROWSER='webkit',
           E2E_ARTIFACT_DIR='ci-logs/chat-keyboard-parent')
try:
    for name in saved:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/chat-keyboard-parent.log').open('w') as output:
        result = subprocess.run(
            ['node', 'js/tests/e2e-chat-responsiveness-browser.mjs'],
            cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode != 1:
        raise RuntimeError(f'Expected parent assertion failure, got {result.returncode}')
    log = (root / 'ci-logs/chat-keyboard-parent.log').read_text()
    assert 'before viewport frames resume (Home)' in log, log
    print(f'Published {parent}: expected bounded Home regression failure')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
    print('Restored current production source and bundle')
