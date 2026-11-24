"""Reproduce private CV model-context omission against the actual PDF parent."""
from pathlib import Path
import os
import subprocess
import sys
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
parent = 'fa58010f126de5311049d09ab46fce3857db18fa'
if '--native' not in sys.argv:
    verify_parent(root, parent, 'forms-private-model', 'js/tests/forms-private-model.test.js')
else:
    names = ['js/src/forms/private-profile.js', 'js/src/forms/model-drafts.js',
             'js/src/automation/answer-model-context.js']
    current = {name: (root / name).read_bytes() for name in names}
    try:
        for name in names:
            (root / name).write_bytes(subprocess.check_output(
                ['git', 'show', f'{parent}:{name}'], cwd=root))
        env = dict(os.environ, RUN_BROWSER_E2E='1', FORMS_PRIVATE_MODEL_ONLY='1',
                   FORMS_PRIVATE_MODEL_BEFORE='1', FORMS_PRIVATE_MODEL_SCREENSHOTS='1',
                   E2E_EXECUTABLE_PATH='/usr/bin/google-chrome',
                   E2E_ARTIFACT_DIR='ci-logs/forms-private-model-parent-browser',
                   NODE_OPTIONS='--max-old-space-size=384')
        with (root / 'ci-logs/forms-private-model-native-before.log').open('w') as output:
            subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                           env=env, stdout=output, stderr=subprocess.STDOUT, check=True)
        before = Path(output.name).read_text()
        assert '[forms-private-model-before]' in before and 'OK (chromium)' in before
    finally:
        for name, data in current.items():
            (root / name).write_bytes(data)
