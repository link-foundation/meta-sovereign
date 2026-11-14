"""Replay one finite delayed guard against the actual parent and controlled-time test."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
test = root / 'js/tests/forms-captcha.test.js'
fixture = root / 'js/tests/helpers/forms-auto-prefill-fixture.mjs'
saved_test, saved_fixture = test.read_bytes(), fixture.read_bytes()
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
command = ['node', '--test', '--test-concurrency=1', '--test-timeout=15000',
           '--test-name-pattern=^CAPTCHA pauses the ordinary deadline', str(test)]
try:
    source = saved_fixture.decode()
    marker = '  const options = {\n'
    assert source.count(marker) == 1
    fixture.write_text(source.replace(marker,
        '  env.hooks.check = async () => {\n'
        '    await new Promise((resolve) => setTimeout(resolve, 120));\n'
        '  };\n' + marker))
    for name, content, expected in [
        ('before', subprocess.check_output(['git', 'show', '868b1f65:js/tests/forms-captcha.test.js'], cwd=root), 1),
        ('after', saved_test, 0),
    ]:
        test.write_bytes(content)
        with (root / f'ci-logs/captcha-deadline-delayed-{name}.log').open('w') as log:
            result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        assert result.returncode == expected, (name, result.returncode)
        print(f'{name}: expected exit {result.returncode}', flush=True)
finally:
    test.write_bytes(saved_test)
    fixture.write_bytes(saved_fixture)
