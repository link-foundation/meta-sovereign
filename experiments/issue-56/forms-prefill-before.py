"""Capture the preceding UI without reviewed prefilling; restore the current bundle."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
bundle = root / 'js/src/web/app.min.js'
current = bundle.read_bytes()
log = root / 'ci-logs/forms-prefill-browser-before.log'
try:
    bundle.write_bytes(subprocess.check_output(
        ['git', 'show', '2bbf8998:js/src/web/app.min.js'], cwd=root))
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
               RUN_BROWSER_E2E='1', FORMS_PREFILL_BEFORE='1')
    with log.open('w') as output:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'],
                                cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'assertion failed: live reviewed prefilling exists' in log.read_text()
    print('Confirmed missing reviewed prefilling controls in the preceding UI.')
finally:
    bundle.write_bytes(current)
