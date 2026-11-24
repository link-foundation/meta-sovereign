"""Run the same finite native scenario against the published extraction callers."""
import subprocess
from application_parent_fixture import published_application_sources

paths = ['js/src/assignments/vacancy-reader.js',
         'js/src/jobs/application-review.js']
with published_application_sources(__file__, 'cd4cd0b5', paths) as (root, env):
    with (root / 'ci-logs/vacancy-loading-before-native.log').open('wb') as log:
        result = subprocess.run(['node', 'experiments/issue-56/vacancy-loading-browser.mjs'],
                                cwd=root, env=env, stdout=log,
                                stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'TimeoutError' in (root / 'ci-logs/vacancy-loading-before-native.log').read_text()
