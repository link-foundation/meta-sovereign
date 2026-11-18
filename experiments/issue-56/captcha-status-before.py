"""Replay the bounded cleanup race against the actual parent, restoring sources."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/forms/automatic-prefill.js'
saved = source.read_bytes()
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', '57bb7360:js/src/forms/automatic-prefill.js'], cwd=root))
    commands = [
        ('parent-unit', ['node', '--test', '--test-concurrency=1',
                         '--test-name-pattern=^UI status stays pending',
                         'js/tests/forms-captcha.test.js'], env),
        ('parent-browser', ['node', 'js/tests/e2e-forms-reader-browser.mjs'],
         dict(env, RUN_BROWSER_E2E='1', E2E_BROWSER='webkit',
              CI_BROWSER_DEBUG='1', FORMS_CAPTCHA_ONLY='1',
              E2E_ARTIFACT_DIR=str(root / 'ci-logs/captcha-status-parent-artifact'))),
    ]
    for name, command, environment in commands:
        with (root / f'ci-logs/captcha-status-{name}.log').open('w') as output:
            result = subprocess.run(command, cwd=root, env=environment,
                                    stdout=output, stderr=subprocess.STDOUT)
        assert result.returncode == 1, (name, result.returncode)
        print(f'{name}: expected exit {result.returncode}', flush=True)
finally:
    source.write_bytes(saved)
