"""Bounded missing-command regressions against the published CLI dispatcher."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/cli/automation-commands.js'
corrected = source.read_bytes()
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', '757e241e:js/src/cli/automation-commands.js'], cwd=root))
    with (root / 'ci-logs/safety-cli-before.log').open('w') as log:
        result = subprocess.run(['node', '--max-old-space-size=384', '--test',
            '--test-concurrency=1', 'js/tests/safety-cli.test.js'],
            cwd=root, stdout=log, stderr=subprocess.STDOUT)
    text = (root / 'ci-logs/safety-cli-before.log').read_text()
    assert result.returncode == 1 and 'fail 7' in text and 'pass 1' in text
    print(json.dumps(dict(parent='757e241e', fail=7, pass_=1, liveProvider=False)))
finally:
    source.write_bytes(corrected)
