"""Render the actual preceding shared component, then restore the draft bundle."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/web/question-browser-controls.js'
current = source.read_bytes()
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', 'ea8d7eae:js/src/web/question-browser-controls.js'], cwd=root))
    with (root / 'ci-logs/question-watch-before-build.log').open('w') as log:
        subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, env=env,
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    with (root / 'ci-logs/question-watch-before-ui.log').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/question-watch-ui.mjs', '--before'],
                       cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
finally:
    source.write_bytes(current)
    with (root / 'ci-logs/question-watch-restored-build.log').open('w') as log:
        subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, env=env,
                       stdout=log, stderr=subprocess.STDOUT, check=True)
