"""Build one isolated application UI probe and drain it before restoring the bundle."""
from pathlib import Path
import os
import subprocess


def run_application_native(script, prefix, group, mcp=False, mcp_env=None,
                           native_entry=None):
    root = Path(script).resolve().parents[2]
    bundle = root / 'js/src/web/app.min.js'
    original = bundle.read_bytes()
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1',
               E2E_BROWSER='chromium', E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome',
               APPLICATION_SCREENSHOTS='docs/screenshots')
    name = 'mcp-server' if mcp else 'native-final'
    try:
        with (root / f'ci-logs/{prefix}-{name}.log').open('w') as log:
            subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, env=env,
                           stdout=log, stderr=subprocess.STDOUT, check=True)
            if mcp:
                server = subprocess.Popen(['node', 'experiments/issue-56/vacancy-mcp-server.mjs'],
                    cwd=root, env=dict(env, APPLICATION_REVIEW_FIXTURE='1', **mcp_env),
                    stdout=log, stderr=subprocess.STDOUT)
                try:
                    print(f'Owned synthetic fixture PID {server.pid}', flush=True)
                    assert server.wait() == 0
                finally:
                    if server.poll() is None:
                        server.terminate()
                        server.wait()
            else:
                entry = native_entry or f'js/tests/e2e-{group}-browser.mjs'
                subprocess.run(['node', entry],
                    cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    finally:
        bundle.write_bytes(original)
