"""Show the actual conventional PDF gap on the parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '5283e26af0135f86fc879a30be18ae418da17c4a'
names = ['js/src/forms/private-profile.js', 'js/src/forms/review-prefill.js',
         'js/src/forms/review-upload.js']
current = {name: (root / name).read_bytes() for name in names}
env = dict(os.environ, RUN_BROWSER_E2E='1', FORMS_PRIVATE_RESUME_ONLY='1',
           FORMS_PRIVATE_RESUME_BEFORE='1', FORMS_PRIVATE_RESUME_SCREENSHOTS='1',
           E2E_EXECUTABLE_PATH='/usr/bin/google-chrome',
           E2E_ARTIFACT_DIR='ci-logs/forms-private-resume-parent-browser',
           NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/forms-private-resume-native-before.log').open('w') as log:
        subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'],
                       cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    text = Path(log.name).read_text()
    assert '[forms-private-resume-before]' in text and 'OK (chromium)' in text
finally:
    for name, data in current.items():
        (root / name).write_bytes(data)
