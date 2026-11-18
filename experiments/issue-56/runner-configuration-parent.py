#!/usr/bin/env python3
"""Finite exact-parent comparison; always restore working production sources."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = '0d6cec93828c404a9cb7d15e7ed313a61d2214fa'
FILES = [f'js/src/{file}' for file in [
    'cli/runner-profile.js', 'cli/runner-command.js',
    'server/runner-controller.js', 'server/runner-profile-store.js',
]]
saved = {file: (ROOT / file).read_bytes() for file in FILES}
try:
    for file in FILES:
        (ROOT / file).write_bytes(subprocess.check_output(
            ['git', 'show', f'{PARENT}:{file}'], cwd=ROOT))
    command = ['node', '--max-old-space-size=256', '--test', '--test-reporter=tap',
               '--test-concurrency=1', 'js/tests/runner-configuration.test.js']
    if '--browser' in sys.argv:
        command = ['node', '--max-old-space-size=384',
                   'experiments/issue-56/runner-configuration-browser.mjs', '--before']
    result = subprocess.run(command, cwd=ROOT, check=False)
finally:
    for file, content in saved.items():
        (ROOT / file).write_bytes(content)
if result.returncode == 0 and '--browser' not in sys.argv:
    raise SystemExit('Expected the actual parent to fail the new regression.')
raise SystemExit(result.returncode if '--browser' in sys.argv else 0)
