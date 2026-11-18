"""Share finite actual-parent regression replays with unconditional restoration."""
import os
from pathlib import Path
import subprocess


def replay_parent(script, prefix, parent, cases):
    """Each case supplies a name, replaced file and finite regression command."""
    root = Path(script).resolve().parents[2]
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
               RUN_BROWSER_E2E='1', E2E_BROWSER='webkit')
    for name, target, command in cases:
        source = root / target
        original = source.read_bytes()
        try:
            source.write_bytes(subprocess.check_output(
                ['git', 'show', f'{parent}:{target}'], cwd=root))
            with (root / f'ci-logs/{prefix}-{name}-before.log').open('w') as log:
                result = subprocess.run(command, cwd=root, env=env,
                                        stdout=log, stderr=subprocess.STDOUT)
            assert result.returncode != 0, f'{name}: parent unexpectedly passes'
            print(f'{name}: expected actual-parent failure {result.returncode}',
                  flush=True)
        finally:
            source.write_bytes(original)
