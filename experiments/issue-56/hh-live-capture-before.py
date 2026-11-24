"""Reproduce missing capture and ownership guards on exact published parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '7973fe42bff797e7c48631b19421d51b2f2789e6'
paths = [f'js/src/sources/{name}.js' for name in [
    'browser-choice-reader', 'browser-choices', 'hh-web-ui',
    'browser-choice-document', 'browser-answer-watch', 'browser-sender']]
paths += ['js/src/automation/question-browser-watch.js']
saved = {path: (root / path).read_bytes() for path in paths}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384',
       'HH_CAPTURE_BEFORE': '1'}
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    checks = [
        ('node', ['node', '--test', '--test-concurrency=1',
                  '--test-name-pattern=confirmed watches attach|Stop-time capture gap',
                  'js/tests/question-browser-watch.test.js'], 2),
        ('native', ['node', 'experiments/issue-56/hh-live-capture-browser.mjs'], 4),
    ]
    for label, command, count in checks:
        log = root / f'ci-logs/hh-capture-before-{label}.log'
        with log.open('wb') as output:
            result = subprocess.run(command, cwd=root, env=env,
                                    stdout=output, stderr=subprocess.STDOUT, check=False)
        data = log.read_text()
        assert result.returncode != 0 if label == 'node' else result.returncode == 0
        assert (f'fail {count}' in data if label == 'node'
                else data.count('[hh-live-capture] FAIL') == count), data
        print(f'{label}: {count} actual-parent failures, draft restored in finally')
finally:
    for path, content in saved.items():
        (root / path).write_bytes(content)
