"""Check the changed review-admission sources without invoking full suites."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
prefix = sys.argv[1] if len(sys.argv) > 1 else 'application-pacing'
paths = subprocess.check_output(['git', 'ls-files', '--modified', '--others',
                               '--exclude-standard', '-z'], cwd=root).decode().split('\0')
text = sorted({p for p in paths if p.endswith(('.js', '.mjs', '.md', '.py', '.json'))
               and not p.endswith('app.min.js') and '/data/' not in p})
formatted = [p for p in text if not p.endswith('.py')]
scripts = [p for p in text if p.endswith(('.js', '.mjs'))]
commands = {
    'format': ['node_modules/.bin/prettier', '--write', *formatted],
    'lint-final': ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js',
                   '--max-warnings=0', *scripts],
    'format-final': ['node_modules/.bin/prettier', '--check', *formatted],
    'secrets-final': ['node_modules/.bin/secretlint', *text],
    'diff-final': ['git', 'diff', '--check'],
}
for name, command in commands.items():
    with (root / f'ci-logs/{prefix}-{name}.log').open('w') as output:
        subprocess.run(command, cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
                       stdout=output, stderr=subprocess.STDOUT, check=True)
print(f'Scoped gates passed for {len(text)} changed text files; no full test suite invoked.')
