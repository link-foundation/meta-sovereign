"""Run finite actual-parent regressions and always restore working sources."""
import os
from pathlib import Path
import subprocess

parent = '123947451a46c18dcc94f1d424c9f66dc13f8a7b'
paths = ['js/src/sources/' + name + '.js' for name in (
    'browser-chat-navigation', 'browser-chat-view-state',
    'browser-conversation-tail', 'browser-unread-conversations')]
saved = {name: Path(name).read_bytes() for name in paths}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in paths:
        Path(name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}']))
    commands = [
        ('node', ['node', '--test', '--test-concurrency=1',
                  '--test-name-pattern=only actual positive replies reach',
                  'js/tests/browser-conversation-tail.test.js']),
        ('browser', ['node', 'experiments/issue-56/unread-reply-view-browser.mjs', '--before']),
    ]
    for name, command in commands:
        with Path(f'ci-logs/unread-reply-view-before-{name}.log').open('w') as output:
            result = subprocess.run(command, env=env, stdout=output, stderr=subprocess.STDOUT)
        assert result.returncode == 1, (name, result.returncode)
finally:
    for name, body in saved.items():
        Path(name).write_bytes(body)
print('Restored all four working sources after actual-parent probes.')
