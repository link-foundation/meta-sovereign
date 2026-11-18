"""Share scoped static checks across source-bound evidence units."""
import os
import subprocess
from evidence_bundle import evidence_context, changed_sources


def check_sources(script, prefix, duplication_dir=None):
    root, logs, _ = evidence_context(script, prefix)
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
    paths = changed_sources(root)
    formatted = [name for name in paths if name.endswith(('.js', '.mjs', '.md', '.json'))]
    scripts = [name for name in formatted if name.endswith(('.js', '.mjs')) and not name.endswith('.min.js')]
    checks = [
        ('format-check', ['node_modules/.bin/prettier', '--check', *formatted]),
        ('lint-final', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js',
                        '--max-warnings=0', *scripts]),
        ('secrets', ['node_modules/.bin/secretlint', *formatted]),
        ('diff', ['git', 'diff', '--check']),
        ('duplication', ['node_modules/.bin/jscpd', '.', '--reporters', 'console,json',
                         '--output', duplication_dir or f'ci-logs/duplication-{prefix}']),
    ]
    for name, command in checks:
        print(f'Checking {name}', flush=True)
        with (logs / f'{prefix}-{name}.log').open('w') as output:
            result = subprocess.run(command, cwd=root, env=env, stdout=output,
                                    stderr=subprocess.STDOUT)
        assert result.returncode == 0, f'{name}: see saved log'
    with (logs / f'{prefix}-limits.log').open('w') as output:
        for name in paths:
            if not name.endswith(('.js', '.mjs', '.py', '.md', '.json')):
                continue
            count = len((root / name).read_text().splitlines())
            limit = 2500 if name.startswith('docs/case-studies/') else 1500
            assert count <= limit, f'{name}: {count}/{limit}'
            output.write(f'{name}: {count}/{limit}\n')
        output.write('Changed sources and documents satisfy their line limits.\n')
