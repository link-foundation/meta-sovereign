"""Reproduce the rendered résumé-warning gap against the actual parent."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = 'e68448ac'
native = '--native' in sys.argv
paths = ['js/src/jobs/' + name for name in [
    'application-page.js', 'application-options.js', 'application-result.js',
    'application-holds.js', 'application-review.js', 'application-actions.js',
]]
if native:
    paths.append('js/src/web/app.min.js')
saved = {name: (root / name).read_bytes() for name in paths}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    log_path = root / f'ci-logs/application-resume-visibility-before{"-native" if native else ""}.log'
    command = ['node', 'experiments/issue-56/application-resume-visibility-native.mjs', '--before'] if native else [
        'node', '--test', '--test-concurrency=1', 'js/tests/job-application-resume-visibility.test.js']
    with log_path.open('w') as log:
        result = subprocess.run(command, cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=log, stderr=subprocess.STDOUT)
    text = log_path.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert ('rendered résumé warning must block' if native else 'fail 6') in text
    print(f'Expected parent visibility failures at {parent}; exit {result.returncode}; native={native}')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
