"""Exercise both hosted fixture invocations and their original failure behavior."""
import os
from pathlib import Path
import subprocess
import tempfile


helper = Path(__file__).resolve().with_name('runner-dependency-hosted.sh')
script = 'experiments/issue-56/runner-node-local.mjs'
logs = ('runner-docker-private-node.log', 'runner-docker-private-npm.log')
with tempfile.TemporaryDirectory(prefix='runner-dependency-hosted-') as temp:
    root = Path(temp)
    node = root / 'node'
    node.write_text('''#!/usr/bin/env bash
printf '%s\\n' "$*"
case "$2" in
  --node-on-path) exit "$RUNNER_EXISTING_NODE_STATUS" ;;
  *) exit "$RUNNER_PRIVATE_NODE_STATUS" ;;
esac
''')
    node.chmod(0o700)
    for missing, existing in ((0, 0), (7, 0), (0, 8)):
        cwd = root / f'{missing}-{existing}'
        cwd.mkdir()
        result = subprocess.run(['bash', helper], cwd=cwd, capture_output=True,
                                text=True, env=dict(
                                    os.environ, PATH=f'{root}:{os.environ["PATH"]}',
                                    RUNNER_PRIVATE_NODE_STATUS=str(missing),
                                    RUNNER_EXISTING_NODE_STATUS=str(existing)))
        assert result.returncode == (missing or existing), result
        assert (cwd / 'ci-logs' / logs[0]).read_text() == f'{script}\n'
        second = cwd / 'ci-logs' / logs[1]
        if missing:
            assert not second.exists()
        else:
            assert second.read_text() == f'{script} --node-on-path\n'
        print(f'Private Node status {missing}, existing Node status {existing}: '
              f'exit {result.returncode}, expected diagnostics preserved')
