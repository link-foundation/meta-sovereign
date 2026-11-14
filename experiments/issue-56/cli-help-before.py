"""Reproduce unnecessary help imports on the exact published CLI parent."""
import subprocess
from application_parent_fixture import published_application_sources

parent = 'fffdc0b2a8a3f91e66eba445e0a6a7dbd3285414'
with published_application_sources(__file__, parent) as (root, env):
    log_path = root / 'ci-logs/cli-help-before.log'
    with log_path.open('wb') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=help and unknown commands load',
            'js/tests/cli-help-imports.test.js'], cwd=root, env=env,
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, log_path.read_text()
    assert 'Help imported the ordinary/provider graph.' in log_path.read_text()
    print('Exact-parent import regression fails; working sources restored and child drained.')
