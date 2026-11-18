"""Run actual-parent cache/metadata regressions and capture the old CV surface."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1',
           E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome')
groups = [
    ('reader', ['js/src/assignments/vacancy-reader.js', 'js/src/assignments/vacancy.js',
                'js/src/assignments/read-page.js'],
     ['node', '--test', '--test-concurrency=1', 'js/tests/vacancy-reader-regression.test.js']),
    ('browser', ['js/src/web/app.min.js'],
     ['node', 'experiments/issue-56/vacancy-browser.mjs', '--before']),
]
for name, paths, command in groups:
    saved = {path: (root / path).read_bytes() for path in paths}
    try:
        for path in paths:
            (root / path).write_bytes(subprocess.check_output(['git', 'show', f'727b3f6b:{path}'], cwd=root))
        with (root / f'ci-logs/vacancy-{name}-before.log').open('w') as log:
            result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        assert result.returncode != 0, f'{name}: parent unexpectedly passes the new regression'
        print(f'{name}: expected parent failure ({result.returncode})', flush=True)
    finally:
        for path, content in saved.items():
            (root / path).write_bytes(content)
