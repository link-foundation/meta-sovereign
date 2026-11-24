"""Run one finite before-state browser regression, restoring sources in finally."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/forms/' + name + '.js' for name in [
    'read-document', 'answer-plan', 'review-prefill', 'review-targets', 'review-apply', 'reader']]
names += ['js/src/web/app.min.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', 'afaf8bed:' + name], cwd=root))
    env = {**os.environ, 'RUN_BROWSER_E2E': '1', 'FORMS_RADIO_BEFORE': '1',
           'NODE_OPTIONS': '--max-old-space-size=384'}
    with (root / 'ci-logs/forms-radio-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'native radio option can be reviewed' in (root / 'ci-logs/forms-radio-browser-before.log').read_text()
    print('Confirmed missing native radio review controls on afaf8bed')
finally:
    for name, contents in saved.items():
        (root / name).write_bytes(contents)
