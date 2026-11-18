"""Check the focused planning regressions against the actual preceding commit."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = [
    'question-browser.js', 'question-browser-watch.js',
    'question-watch-records.js', 'question-watch-cycle.js',
]
sources = [root / 'js/src/automation' / name for name in names]
current = {source: source.read_bytes() for source in sources}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for source in sources:
        source.write_bytes(subprocess.check_output([
            'git', 'show', f'2b0f6557:{source.relative_to(root)}'], cwd=root))
    with (root / 'ci-logs/question-watch-planning-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            'js/tests/question-watch-planning.test.js'], cwd=root, env=env,
            stdout=log, stderr=subprocess.STDOUT)
    if result.returncode != 1:
        raise RuntimeError(f'expected failing regressions, got {result.returncode}')
finally:
    for source, content in current.items():
        source.write_bytes(content)
