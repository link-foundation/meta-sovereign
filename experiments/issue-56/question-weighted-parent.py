#!/usr/bin/env python3
"""Compare the finite regression to the exact parent; restore every source."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = '1b449fb54827614b32840fb54ecdef531f3eb1b0'
FILES = [f'js/src/{file}' for file in [
    'automation/question-match.js', 'automation/question-answers.js',
    'automation/question-matching-options.js', 'cli/question-matching-flags.js',
]]
saved = {file: (ROOT / file).read_bytes() for file in FILES}
try:
    for file in FILES:
        (ROOT / file).write_bytes(subprocess.check_output(
            ['git', 'show', f'{PARENT}:{file}'], cwd=ROOT))
    result = subprocess.run([
        'node', '--max-old-space-size=256', '--test', '--test-reporter=tap',
        '--test-concurrency=1', 'js/tests/question-weighted.test.js',
    ], cwd=ROOT, check=False)
finally:
    for file, content in saved.items():
        (ROOT / file).write_bytes(content)
if result.returncode == 0:
    raise SystemExit('Expected the actual parent to fail the new regression.')
