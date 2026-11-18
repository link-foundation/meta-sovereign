"""Run scoped static checks and the existing duplication gate sequentially."""
import os
import subprocess
from evidence_bundle import evidence_context, changed_sources

root, logs, _ = evidence_context(__file__, 'dispatch-stop')
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
paths = changed_sources(root)
formatted = [name for name in paths if name.endswith(('.js', '.mjs', '.md', '.json'))]
scripts = [name for name in formatted if name.endswith(('.js', '.mjs'))]
checks = [
    ('format-check', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('lint-final', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js',
                    '--max-warnings=0', *scripts]),
    ('secrets', ['node_modules/.bin/secretlint', *formatted]),
    ('diff', ['git', 'diff', '--check']),
    ('duplication', ['node_modules/.bin/jscpd', '.', '--reporters', 'console,json',
                     '--output', 'ci-logs/duplication-stop']),
]
for name, command in checks:
    print(f'Checking {name}', flush=True)
    with (logs / f'dispatch-stop-{name}.log').open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output,
                                stderr=subprocess.STDOUT)
    assert result.returncode == 0, f'{name}: see saved log'
with (logs / 'dispatch-stop-limits.log').open('w') as output:
    for name in paths:
        if not name.endswith(('.js', '.mjs', '.py', '.md', '.json')):
            continue
        count = len((root / name).read_text().splitlines())
        limit = 2500 if name.startswith('docs/case-studies/') else 1500
        assert count <= limit, f'{name}: {count}/{limit}'
        output.write(f'{name}: {count}/{limit}\n')
    output.write('Changed sources and documents satisfy their line limits.\n')
