"""Capture the finite résumé-upload failure against the preceding implementation."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/forms/' + name + '.js' for name in [
    'read-document', 'review-prefill', 'review-targets', 'review-sessions', 'reader']]
names += ['js/src/web/app.min.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', '32253199:' + name], cwd=root))
    env = {**os.environ, 'RUN_BROWSER_E2E': '1', 'FORMS_UPLOAD_BEFORE': '1', 'FORMS_UPLOAD_ONLY': '1',
           'NODE_OPTIONS': '--max-old-space-size=384'}
    with (root / 'ci-logs/forms-upload-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'PDF résumé field exposes reviewed attachment' in (root / 'ci-logs/forms-upload-browser-before.log').read_text()
    print('Confirmed missing résumé-upload inspection on 32253199')
finally:
    for name, contents in saved.items():
        (root / name).write_bytes(contents)
