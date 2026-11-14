"""Run two bounded baseline regressions, restoring each source file afterward."""
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
paths = [
    'js/src/forms/reader.js', 'js/src/forms/review-prefill.js',
    'js/src/forms/review-sessions.js', 'js/src/forms/review-journal.js',
    'js/src/server/routes-form-reviews.js', 'js/src/cli/forms-review-commands.js',
]
saved = {name: (ROOT / name).read_bytes() for name in paths}
try:
    for name in paths:
        (ROOT / name).write_bytes(subprocess.check_output(['git', 'show', f'b1206126:{name}'], cwd=ROOT))
    with (ROOT / 'ci-logs/forms-auto-prefill-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=automatic prefill fills more|multi-URL CLI',
            'js/tests/forms-auto-prefill.test.js',
        ], cwd=ROOT, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'The baseline unexpectedly implements automatic prefilling.'
finally:
    for name, data in saved.items():
        (ROOT / name).write_bytes(data)
