"""Run finite public-lifecycle regressions against the exact published parent."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    'js/src/automation/autopilot.js', 'js/src/automation/deliver.js',
    'js/src/automation/next-chat.js', 'js/src/automation/runner.js',
    'js/src/automation/ordered-reply.js',
    'js/src/automation/vk-queued-delivery.js', 'js/src/server/index.js',
]
saved = {name: (ROOT / name).read_bytes() for name in FILES}
try:
    for name in FILES:
        (ROOT / name).write_bytes(subprocess.check_output([
            'git', 'show', f'2769b823:{name}'], cwd=ROOT))
    with (ROOT / 'ci-logs/autopilot-stop-before.log').open('wb') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=256', '--test', '--test-concurrency=1',
            'js/tests/autopilot-stop-ownership.test.js',
            'js/tests/autopilot-control-ownership.test.js',
        ], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
