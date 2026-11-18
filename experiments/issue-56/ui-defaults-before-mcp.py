"""Serve the published parent renderer/API for independent MCP verification."""
import subprocess
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '10a9f1e1') as (root, env):
    bundle = root / 'js/src/web/app.min.js'
    original = bundle.read_bytes()
    try:
        with (root / 'ci-logs/ui-defaults-before-mcp-server.log').open('wb') as log:
            subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
            server = subprocess.Popen(['node', 'experiments/issue-56/ui-defaults-mcp-server.mjs'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                assert server.wait() == 0
            finally:
                if server.poll() is None:
                    server.terminate()
                    server.wait()
    finally:
        bundle.write_bytes(original)
