"""Run finite actual-parent assertions and restore the production sources."""
import os
import subprocess


def verify_parent(root, parent, prefix, test, pattern='.', ui=None):
    paths = subprocess.check_output(
        ['git', 'diff', parent, '--name-only', '--', 'js/src'],
        cwd=root, text=True).splitlines()
    existing = set(subprocess.check_output(
        ['git', 'ls-tree', '-r', '--name-only', parent, '--', 'js/src'],
        cwd=root, text=True).splitlines())
    paths = [path for path in paths if path in existing
             and path != 'js/src/web/app.min.js']
    current = {path: (root / path).read_bytes() for path in paths}
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1')

    def run(name, args, check=True):
        with (root / f'ci-logs/{prefix}-{name}.log').open('w') as output:
            return subprocess.run(args, cwd=root, env=env, stdout=output,
                                  stderr=subprocess.STDOUT, check=check)

    try:
        for path in paths:
            (root / path).write_bytes(subprocess.check_output(
                ['git', 'show', f'{parent}:{path}'], cwd=root))
        result = run('before-node', [
            'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
            f'--test-name-pattern={pattern}', test], check=False)
        if result.returncode != 1:
            raise RuntimeError(f'Expected parent assertion failure, got {result.returncode}')
        if ui:
            run('before-build', ['node', 'js/scripts/build-web.mjs'])
            run('before-ui', ['node', ui, '--before'])
    finally:
        for path, content in current.items():
            (root / path).write_bytes(content)
        if ui:
            run('restored-build', ['node', 'js/scripts/build-web.mjs'])
