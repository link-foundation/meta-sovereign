"""Bounded actual-parent native regression; restore the working source in finally."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/sources/browser-chat-navigation.js'
working = source.read_bytes()
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', '82360a8f:js/src/sources/browser-chat-navigation.js'], cwd=root))
    with (root / 'ci-logs/chat-repetition-before-browser.log').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/chat-navigation-browser.mjs',
                        '--repeat', '--before'], cwd=root, check=True,
                       env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
                       stdout=log, stderr=subprocess.STDOUT)
finally:
    source.write_bytes(working)
    print('Working navigation source restored')
