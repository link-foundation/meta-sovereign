"""Run the finite native regression against the exact published reader."""
import subprocess
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '4114717bd0adf286007f02e8067b9e409f82d03c',
                                   ['js/src/assignments/vacancy-reader.js']) as (root, env):
    with (root / 'ci-logs/vacancy-modern-before-native.log').open('wb') as log:
        result = subprocess.run(['node', 'experiments/issue-56/vacancy-modern-browser.mjs', '--before'],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'modern native employment retained' in (root / 'ci-logs/vacancy-modern-before-native.log').read_text()
