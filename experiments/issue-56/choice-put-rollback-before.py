"""Replay real-store failures on the actual shared helper and restore it."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
sources = [root / f'js/src/jobs/technology-{name}.js' for name in ['storage', 'catalog']]
current = {source: source.read_bytes() for source in sources}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
           RUN_BROWSER_E2E='1', E2E_BROWSER='webkit')
try:
    for source in sources:
        source.write_bytes(subprocess.check_output([
            'git', 'show', f'262280fc:{source.relative_to(root)}'], cwd=root))
    for suffix, args, expected in [
        ('before-node', ['node', '--test', '--test-concurrency=1',
                         'js/tests/job-choice-durability.test.js'], 'fail 4'),
        ('before-ui', ['node', 'experiments/issue-56/choice-put-rollback-browser.mjs',
                       '--before'], 'Reload must retain the last acknowledged choice'),
    ]:
        if '--unit-only' in sys.argv and suffix == 'before-ui':
            continue
        with (root / f'ci-logs/choice-put-rollback-{suffix}.log').open('w') as out:
            result = subprocess.run(args, cwd=root, env=env, stdout=out,
                                    stderr=subprocess.STDOUT)
        assert result.returncode == 1
        assert expected in (root / f'ci-logs/choice-put-rollback-{suffix}.log').read_text()
    print('Actual parent exposes failed writes after reload; current source restored.')
finally:
    for source, content in current.items():
        source.write_bytes(content)
