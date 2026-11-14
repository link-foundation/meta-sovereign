"""Check only the fixture correction; native groups supply its regression."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
files = [
    'js/tests/helpers/e2e-question-unread-controls.mjs',
    'js/tests/helpers/e2e-unread-notice-controls.mjs',
    'experiments/issue-56/ci-unread-recovery-browser.mjs',
    'docs/case-studies/issue-56/ci-unread-recovery.md',
    'docs/case-studies/issue-56/README.md',
    'docs/case-studies/issue-56/PLAN.md',
]
scripts = [name for name in files if name.endswith('.mjs')]
for name, command in [
    ('format', ['node_modules/.bin/prettier', '--write', *files]),
    ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js', '--max-warnings=0', *scripts]),
    ('format-check', ['node_modules/.bin/prettier', '--check', *files]),
    ('secretlint', ['node_modules/.bin/secretlint', *files]),
    ('duplication', ['npm', 'run', 'check:duplication']),
]:
    with (root / f'ci-logs/ci-unread-recovery-{name}-verified.log').open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
