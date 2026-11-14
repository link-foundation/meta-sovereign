"""Exercise the exact published recovery path and restore current sources."""
from pathlib import Path
import os
import subprocess
import sys

paths = ['js/src/jobs/application-service.js', 'js/src/jobs/application-journal.js',
         'js/src/jobs/application-review.js']
original = {name: Path(name).read_bytes() for name in paths}
try:
    for name in paths:
        Path(name).write_bytes(subprocess.check_output(['git', 'show', f'e1c10104:{name}']))
    if '--mcp' in sys.argv:
        with open('ci-logs/application-recovery-before-mcp-server.log', 'wb') as log:
            server = subprocess.Popen(['node', '--max-old-space-size=384',
                'experiments/issue-56/vacancy-mcp-server.mjs'], stdout=log,
                stderr=subprocess.STDOUT, env=dict(os.environ, APPLICATION_REVIEW_FIXTURE='1'))
            try:
                print(f'Exact-parent MCP fixture process {server.pid}', flush=True)
                assert server.wait() == 0
            finally:
                if server.poll() is None:
                    server.terminate()
                    server.wait()
        sys.exit(0)
    native = '--native' in sys.argv
    logfile = 'ci-logs/application-recovery-before-native.log' if native else 'ci-logs/application-recovery-before.log'
    command = ['node', '--max-old-space-size=384', 'experiments/issue-56/application-recovery-native.mjs'] if native else ['node', '--max-old-space-size=384', '--test',
                                 '--test-concurrency=1', '--test-name-pattern=full-form recovery',
                                 'js/tests/job-application-recovery.test.js']
    with open(logfile, 'wb') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT,
            env=dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='chromium',
                     E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome'))
    assert result.returncode != 0, 'The exact parent unexpectedly recovers its native full form'
    assert "'ready'" in Path(logfile).read_text()
    print('Exact parent returns to ready instead of its acknowledged questionnaire')
finally:
    for name, value in original.items():
        Path(name).write_bytes(value)
    assert all(Path(name).read_bytes() == value for name, value in original.items())
