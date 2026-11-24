"""Reproduce decorated model output, restoring the shared validator afterward."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
validator = root / 'js/src/automation/answer-model-drafts.js'
original = validator.read_bytes()
environment = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
checks = [
    ('forms-plain-before.log', ['node', '--test', '--test-concurrency=1',
     '--test-name-pattern=one model batch handles only', 'js/tests/answer-model-drafts.test.js'],
     environment, "value: '**I build accessible browser interfaces.**'"),
    ('forms-plain-browser-before.log', ['node', 'js/tests/e2e-forms-reader-browser.mjs'],
     dict(environment, RUN_BROWSER_E2E='1', FORMS_MODEL_ONLY='1', FORMS_PLAIN_BEFORE='1',
          E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome'), 'selected CV produces a reviewed proposal'),
]
try:
    validator.write_bytes(subprocess.check_output([
        'git', 'show', 'aa591e85:js/src/automation/answer-model-drafts.js'], cwd=root))
    for name, command, env, message in checks:
        target = root / 'ci-logs' / name
        with target.open('w') as output:
            result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
        assert result.returncode != 0 and message in target.read_text()
finally:
    validator.write_bytes(original)
