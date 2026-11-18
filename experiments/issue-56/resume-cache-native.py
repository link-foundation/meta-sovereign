"""Run only the cache regression, preserving the existing application bundle."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
bundle = root / 'js/src/web/app.min.js'
original = bundle.read_bytes()
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1',
           E2E_BROWSER='chromium', E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome',
           APPLICATION_SCREENSHOTS='docs/screenshots', RESUME_CACHE_FAILURE='1')
mcp = '--mcp' in sys.argv
try:
    with (root / f'ci-logs/resume-cache-{"mcp-server" if mcp else "native-final"}.log').open('w') as log:
        subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, env=env,
                       stdout=log, stderr=subprocess.STDOUT, check=True)
        command = 'vacancy-mcp-server' if mcp else 'resume-cache-browser'
        process = subprocess.Popen(['node', f'experiments/issue-56/{command}.mjs'],
                                   cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            print(f'Owned cache fixture PID {process.pid}', flush=True)
            assert process.wait() == 0
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()
finally:
    bundle.write_bytes(original)
