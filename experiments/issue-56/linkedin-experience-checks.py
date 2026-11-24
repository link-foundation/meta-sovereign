"""Finite checks of this unit's changed source; no full runtime or browser matrix."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = subprocess.check_output(['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
names = sorted(set(name for name in names if name and not name.startswith('docs/case-studies/issue-56/data/') and not name.endswith('app.min.js')))
scripts = [name for name in names if Path(name).suffix in ['.js', '.mjs']]
formatted = [name for name in names if Path(name).suffix in ['.js', '.mjs', '.md']]
def check(name, command, memory=192):
    with (root / f'ci-logs/linkedin-export-{name}.log').open('w') as log:
        subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT,
            env={**os.environ, 'NODE_OPTIONS': f'--max-old-space-size={memory}'}, check=True)
check('format-write', ['npx', 'prettier', '--write', *formatted])
check('format', ['npx', 'prettier', '--check', *formatted])
check('lint-final', ['npx', 'eslint', '--config', 'js/eslint.config.js', '--max-warnings', '0', *scripts])
check('secrets', ['npx', 'secretlint', *[name for name in names if Path(name).suffix != '.png']])
check('diff', ['git', 'diff', '--check'])
check('duplication', ['npx', 'jscpd', '.'], 512)
print('Changed-source format, strict lint, secrets, diff and repository duplication checks passed.')
