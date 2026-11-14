"""Bounded exact-parent reproduction of a late first navigation probe."""
import subprocess
from application_parent_fixture import published_application_sources

parent = 'ec835b0b109846abcd2f615ba8507d0d79f6a69d'
with published_application_sources(__file__, parent) as (root, env):
    path = root / 'ci-logs/cv-save-recovery-clock-before.log'
    with path.open('wb') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=native Save navigation can destroy',
            'js/tests/cv-save-watch-recovery.test.js'], cwd=root,
            env=dict(env, CV_WATCH_FIXTURE_DESCHEDULE_MS='120'),
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, path.read_text()
    assert 'jobs-cv-readback' in path.read_text(), path.read_text()
    print('Exact-parent finite scheduling failure retained; sources restored and process drained.')
