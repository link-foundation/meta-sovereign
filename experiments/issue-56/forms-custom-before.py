"""Bounded custom-control browser regression with source restoration."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/forms/' + name + '.js' for name in [
    'read-document', 'answer-plan', 'review-radio', 'review-targets', 'review-apply']]
names += ['js/src/web/app.min.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', 'e975396a:' + name], cwd=root))
    env = {**os.environ, 'RUN_BROWSER_E2E': '1', 'FORMS_CUSTOM_BEFORE': '1', 'FORMS_CUSTOM_ONLY': '1',
           'NODE_OPTIONS': '--max-old-space-size=384'}
    with (root / 'ci-logs/forms-custom-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'custom radio option can be reviewed' in (root / 'ci-logs/forms-custom-browser-before.log').read_text()
    print('Confirmed missing reviewed custom controls on e975396a')
finally:
    for name, contents in saved.items():
        (root / name).write_bytes(contents)
