"""Run the bounded HTML regression against the actual published parent."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = '1f0c7287b7869c2a41fea826c84723607d3156dd'
paths = ['js/src/assignments/vacancy-reader.js', 'js/src/assignments/vacancy-content.js',
         'js/src/jobs/technology-analysis.js']
saved = {path: (root / path).read_bytes() for path in paths}
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{path}'], cwd=root))
    with (root / 'ci-logs/vacancy-html-before.log').open('w') as log:
        result = subprocess.run(
            ['node', '--test', '--test-concurrency=1', '--test-timeout=10000',
             'js/tests/vacancy-html.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'Published parent unexpectedly passes HTML preservation'
    print(f'Expected parent regression failure: {parent} (exit {result.returncode})')
    if '--browser' in sys.argv:
        with (root / 'ci-logs/vacancy-html-browser-before.log').open('w') as log:
            result = subprocess.run(
                ['node', 'experiments/issue-56/vacancy-html-browser.mjs'], cwd=root,
                env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
                stdout=log, stderr=subprocess.STDOUT)
        assert result.returncode != 0, 'Published parent unexpectedly retains native HTML'
        print(f'Expected native parent failure (exit {result.returncode})')
finally:
    for path, content in saved.items():
        (root / path).write_bytes(content)
