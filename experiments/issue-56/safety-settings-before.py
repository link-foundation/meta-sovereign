"""Run the focused web regressions against the published implementation."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/web/automation-api.js'
original = source.read_bytes()
parent = subprocess.check_output(['git', 'show', '62e7c474:js/src/web/automation-api.js'], cwd=root)
try:
    source.write_bytes(parent)
    with (root / 'ci-logs/safety-settings-web-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=safety web',
            'js/tests/safety-settings-acknowledgement.test.js',
        ], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    output = (root / 'ci-logs/safety-settings-web-before.log').read_text()
    assert 'fail 5' in output, output
    print(json.dumps(dict(parent='62e7c474',
        parentSha256=hashlib.sha256(parent).hexdigest(),
        correctedSha256=hashlib.sha256(original).hexdigest(),
        failingWebTests=5, liveProvider=False)))
finally:
    source.write_bytes(original)
