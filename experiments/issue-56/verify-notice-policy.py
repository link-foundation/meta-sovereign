"""Run only this unit's focused checks, sequentially within the local budget."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
focused = [f'js/tests/question-notice-{name}.test.js' for name in [
    'policy', 'watch', 'policy-controls', 'policy-i18n']]
restart = ['js/tests/question-notice-restart.test.js']
compatibility = [f'js/tests/{name}.test.js' for name in [
    'question-policy', 'question-notices', 'question-browser-watch',
    'question-browser-watch-controls', 'browser-choices', 'browser-text-reply',
    'question-browser-text-state']]
node = ['node', '--test', '--test-concurrency=1', '--test-timeout=15000']
checks = [
    ('node', [*node, *focused]),
    ('restart', [*node, *restart]),
    ('compatibility', [*node, *compatibility]),
    ('deno', ['deno', 'test', '--allow-all', '--no-lock',
              *focused[:2], *restart]),
    ('browser', ['node', 'experiments/issue-56/notice-policy-browser.mjs']),
    ('ui', ['node', 'experiments/issue-56/notice-policy-ui.mjs']),
]
for name, command in checks:
    log = root / f'ci-logs/notice-policy-{name}.log'
    with log.open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output,
                                stderr=subprocess.STDOUT)
    print(f'{name}: exit {result.returncode}; {log.relative_to(root)}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
