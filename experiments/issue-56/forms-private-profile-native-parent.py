"""Show actual existing private contacts remaining unresolved on the parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '77bd5f7129c8c1a628832f0ce63875d5b83875a9'
names = ['js/src/forms/answer-plan.js', 'js/src/forms/answer-learning.js',
         'js/src/automation/question-profile-source.js']
current = {name: (root / name).read_bytes() for name in names}
env = dict(os.environ, RUN_BROWSER_E2E='1', FORMS_PRIVATE_PROFILE_ONLY='1',
           FORMS_PRIVATE_PROFILE_BEFORE='1', FORMS_PRIVATE_PROFILE_SCREENSHOTS='1',
           E2E_EXECUTABLE_PATH='/usr/bin/google-chrome',
           E2E_ARTIFACT_DIR='ci-logs/forms-private-profile-parent-browser',
           NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/forms-private-profile-native-before.log').open('w') as log:
        subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'],
                       cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    text = Path(log.name).read_text()
    assert '[forms-private-profile-before]' in text and 'OK (chromium)' in text
finally:
    for name, data in current.items():
        (root / name).write_bytes(data)
