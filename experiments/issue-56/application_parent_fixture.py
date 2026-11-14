"""Temporarily select an exact published application source and drain its fixture."""
from contextlib import contextmanager
from pathlib import Path
import os
import subprocess


@contextmanager
def published_application_sources(script, parent):
    root = Path(script).resolve().parents[2]
    changed = subprocess.check_output([
        'git', 'diff', '--name-only', parent, '--', 'js/src'], cwd=root,
        text=True).splitlines()
    original = {name: (root / name).read_bytes() for name in changed
                if subprocess.run(['git', 'cat-file', '-e', f'{parent}:{name}'],
                    cwd=root, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL).returncode == 0}
    env = dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='chromium',
               E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome')
    try:
        for name in original:
            (root / name).write_bytes(subprocess.check_output(
                ['git', 'show', f'{parent}:{name}'], cwd=root))
        yield root, env
    finally:
        for name, value in original.items():
            (root / name).write_bytes(value)
        assert all((root / name).read_bytes() == value
                   for name, value in original.items())


def run_parent_application_probe(root, env, prefix, command, native=False):
    """Preserve the working bundle while capturing a finite parent regression."""
    path = root / f'ci-logs/{prefix}-before{"-native" if native else ""}.log'
    bundle = root / 'js/src/web/app.min.js'
    original = bundle.read_bytes()
    try:
        with path.open('wb') as log:
            if native:
                subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root,
                               env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
            result = subprocess.run(command, cwd=root, env=env, stdout=log,
                                    stderr=subprocess.STDOUT)
    finally:
        bundle.write_bytes(original)
    return path, result


def serve_parent_application(root, env, prefix, extra_env=None):
    with (root / f'ci-logs/{prefix}-before-mcp-server.log').open('wb') as log:
        server = subprocess.Popen([
            'node', '--max-old-space-size=384',
            'experiments/issue-56/vacancy-mcp-server.mjs'], cwd=root,
            stdout=log, stderr=subprocess.STDOUT,
            env=dict(env, APPLICATION_REVIEW_FIXTURE='1', APPLICATION_DRAFT_FIXTURE='1', **(extra_env or {})))
        try:
            print(f'Exact parent application fixture process {server.pid}', flush=True)
            assert server.wait() == 0
        finally:
            if server.poll() is None:
                server.terminate()
                server.wait()
