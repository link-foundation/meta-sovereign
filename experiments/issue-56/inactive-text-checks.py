"""Scoped formatting, lint and secret checks for the inactive-write unit."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = set(subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=root, text=True).splitlines())
names.update(subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).splitlines())
files = sorted(name for name in names if Path(name).suffix in ('.js', '.mjs', '.json', '.md', '.py'))
code = [name for name in files if Path(name).suffix in ('.js', '.mjs')]
formatted = [name for name in files if not name.endswith('.py')]
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
for label, command in (
    ('format-check', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js', *code]),
    ('secrets', ['node_modules/.bin/secretlint', *files]),
):
    with (root / f'ci-logs/inactive-text-{label}.log').open('w') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    print(label, result.returncode, flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
