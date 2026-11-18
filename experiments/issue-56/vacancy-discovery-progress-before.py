"""Replay the exact published test against four bounded slower native reads."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
helper = root / 'js/tests/helpers/e2e-vacancy-discovery.mjs'
current = helper.read_bytes()
env = dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='webkit',
           NODE_OPTIONS='--max-old-space-size=384',
           MS_JOBS_DISCOVERY_DEBUG='1', VACANCY_FIXTURE_NAVIGATION_DELAY_MS='3000')
try:
    helper.write_bytes(subprocess.check_output(
        ['git', 'show', 'b0d1b6a3:js/tests/helpers/e2e-vacancy-discovery.mjs'], cwd=root))
    with (root / 'ci-logs/vacancy-discovery-progress-before.log').open('w') as log:
        result = subprocess.run(['node', 'experiments/issue-56/discovery-browser.mjs'],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
    text = (root / 'ci-logs/vacancy-discovery-progress-before.log').read_text()
    assert 'Timeout 30000ms exceeded' in text and 'data-discovery-phase=' in text
    print('Published test fails awaiting aggregate completion; four finite reads retain readiness')
finally:
    helper.write_bytes(current)
