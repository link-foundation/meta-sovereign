"""Reproduce missing native-export publication with the exact published service."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
service = root / 'js/src/jobs/cv-publication-service.js'
current = service.read_bytes()
log = root / 'ci-logs/cv-publication-exports-before.log'
try:
    service.write_bytes(subprocess.check_output([
        'git', 'show', '9945c266:js/src/jobs/cv-publication-service.js'], cwd=root))
    with log.open('wb') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=publication accepts only the selected verified native export',
            'js/tests/cv-publication-exports.test.js',
        ], cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'Published parent unexpectedly accepted native exports'
    assert 'jobs-cv-publication-unverified' in log.read_text(), log.read_text()
finally:
    service.write_bytes(current)
print('Exact 9945c266 native-export plan refused; current source restored.')
