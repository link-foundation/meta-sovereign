"""Reproduce four missing-source/document-heading regressions on the parent."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/assignments/draft.js', 'js/src/assignments/service.js']
original = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output([
            'git', 'show', f'9feb1d62fd70f48fbe9d1e4e191bb2877f59e03d:{name}',
        ], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-timeout=15000',
        '--test-name-pattern=linked instructions reach|six words copied from linked|invalid linked source URLs|written deliverable',
        'js/tests/assignment-source.test.js', 'js/tests/assignment-publisher.test.js',
    ], cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (root / 'ci-logs/assignment-source-before.log').write_text(result.stdout)
    assert result.returncode == 1 and 'fail 4' in result.stdout, result.stdout[-2000:]
    print('Four regressions fail on the parent; working sources restored.')
finally:
    for name, data in original.items():
        (root / name).write_bytes(data)
