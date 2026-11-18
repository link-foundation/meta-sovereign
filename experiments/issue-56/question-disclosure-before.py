"""Reproduce retained-document disclosure failures against the actual parent."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'd771106d1b338f714735a3601033905b27a1b276'
names = ['js/tests/helpers/question-preview.mjs',
         'js/tests/helpers/e2e-notice-learning.mjs',
         'js/tests/helpers/e2e-hh-history.mjs']
saved = {name: (root / name).read_bytes() for name in names}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384',
       'RUN_BROWSER_E2E': '1'}
assert env.get('E2E_EXECUTABLE_PATH'), 'Choose an installed Chromium executable.'
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    for suffix, preview in [('before', '0'), ('preview-before', '1')]:
        target = root / f'ci-logs/ci-question-disclosure-{suffix}.log'
        with target.open('w') as log:
            result = subprocess.run(
                ['node', 'experiments/issue-56/question-disclosure-probe.mjs'],
                cwd=root, env={**env, 'QUESTION_DISCLOSURE_PREVIEW_ONLY': preview,
                               'E2E_ARTIFACT_DIR': str(target.with_suffix(''))},
                stdout=log, stderr=subprocess.STDOUT)
        text = target.read_text()
        assert result.returncode == 1 and 'locator.click: Timeout 5000ms' in text
        assert '"open":false' in text
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
print('Both actual-parent disclosure regressions fail; current helpers restored.')
