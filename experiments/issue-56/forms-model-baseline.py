"""Reproduce the absent model planner and UI, restoring both files afterward."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
files = ['js/src/forms/answer-plan.js', 'js/src/web/app.min.js']
saved = {name: (root / name).read_bytes() for name in files}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in files:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'60eb49c5:{name}'], cwd=root))
    with (root / 'ci-logs/forms-model-before.log').open('w') as output:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
                                 '--test-name-pattern=one model batch handles only',
                                 'js/tests/answer-model-drafts.test.js'], cwd=root,
                                env=env, stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode != 0
    assert "0 !== 1" in (root / 'ci-logs/forms-model-before.log').read_text()
    browser_env = dict(env, RUN_BROWSER_E2E='1', FORMS_MODEL_ONLY='1',
                       FORMS_MODEL_BEFORE='1', E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome')
    with (root / 'ci-logs/forms-model-browser-before.log').open('w') as output:
        browser = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'],
                                 cwd=root, env=browser_env, stdout=output, stderr=subprocess.STDOUT)
    assert browser.returncode != 0
    assert 'model configuration is available' in (root / 'ci-logs/forms-model-browser-before.log').read_text()
    print('Original missing model planner and UI reproduced; current sources restored.')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
