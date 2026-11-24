"""Reproduce delivery loss against exact parent production sources, then restore."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'bea3183ee94d04d0cb51b3961b0db08d84ef01c7'
names = ['browser-choice-reader', 'browser-choices', 'hh-web-ui',
         'browser-choice-controller', 'browser-message', 'browser-history-archive']
paths = [f'js/src/sources/{name}.js' for name in names]
paths += ['js/src/automation/question-learning.js',
          'js/src/automation/question-archive.js']
saved = {path: (root / path).read_bytes() for path in paths}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384',
       'HH_DELIVERY_BEFORE': '1'}
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    checks = [
        ('node', ['node', '--test', '--test-concurrency=1',
                  '--test-name-pattern=delivery observations|acknowledged native delivery|read-only legacy browser',
                  'js/tests/browser-message-state.test.js',
                  'js/tests/browser-history-archive.test.js',
                  'js/tests/migrations-hh-browser-delivery.test.js'], 3),
        ('native', ['node', 'experiments/issue-56/hh-delivery-browser.mjs'], 3),
    ]
    for label, command, count in checks:
        log = root / f'ci-logs/hh-delivery-before-{label}.log'
        with log.open('wb') as output:
            result = subprocess.run(command, cwd=root, env=env,
                                    stdout=output, stderr=subprocess.STDOUT, check=False)
        data = log.read_text()
        assert result.returncode != 0, label
        assert (f'fail {count}' in data if label == 'node'
                else data.count('[hh-choices] FAIL') == count), data
        print(f'{label}: {count} actual-parent failures, draft restored in finally')
finally:
    for path, content in saved.items():
        (root / path).write_bytes(content)
