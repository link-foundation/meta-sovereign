"""Show the exact published UI bundle without disturbing the current build."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
bundle = root / 'js/src/web/app.min.js'
original = bundle.read_bytes()
try:
    bundle.write_bytes(subprocess.check_output([
        'git', 'show', '81d55350:js/src/web/app.min.js'], cwd=root))
    with (root / 'ci-logs/application-ui-before-native.log').open('w') as log:
        subprocess.run(['node', '--max-old-space-size=384',
                        'experiments/issue-56/application-panel-native.mjs', '--before'],
                       cwd=root, check=True, stdout=log, stderr=subprocess.STDOUT,
                       env=dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='chromium',
                                E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome'))
finally:
    bundle.write_bytes(original)
