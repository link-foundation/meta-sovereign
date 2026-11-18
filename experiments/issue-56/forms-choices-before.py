"""Capture the finite closed-choice failure against the preceding implementation."""
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
        (root / name).write_bytes(subprocess.check_output(['git', 'show', 'a7682ac7:' + name], cwd=root))
    env = {**os.environ, 'RUN_BROWSER_E2E': '1', 'FORMS_CHOICES_BEFORE': '1', 'FORMS_CHOICES_ONLY': '1',
           'NODE_OPTIONS': '--max-old-space-size=384'}
    with (root / 'ci-logs/forms-choices-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'closed combobox exposes explicit choice inspection' in (root / 'ci-logs/forms-choices-browser-before.log').read_text()
    print('Confirmed missing closed-choice inspection on a7682ac7')
finally:
    for name, contents in saved.items():
        (root / name).write_bytes(contents)
