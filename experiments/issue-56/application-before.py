"""Bounded parent feature check; restore every working byte even on failure."""
from pathlib import Path
import subprocess

paths = ['js/src/jobs/service.js', 'js/src/server/routes-vacancies.js',
         'js/src/cli/vacancy-commands.js', 'js/src/forms/review-prefill.js']
original = {name: Path(name).read_bytes() for name in paths}
try:
    for name in paths:
        Path(name).write_bytes(subprocess.check_output(['git', 'show', f'8d16669e:{name}']))
    with open('ci-logs/application-before.log', 'wb') as log:
        result = subprocess.run(['node', '--max-old-space-size=384', '--test',
                                 '--test-concurrency=1', '--test-timeout=10000',
                                 'js/tests/job-application-controls.test.js'], stdout=log, stderr=subprocess.STDOUT)
    if result.returncode == 0:
        raise RuntimeError('The unchanged parent unexpectedly supports the application controls')
    print('Parent application interface regression failed as expected:', result.returncode)
finally:
    for name, value in original.items():
        Path(name).write_bytes(value)
    assert all(Path(name).read_bytes() == value for name, value in original.items())
