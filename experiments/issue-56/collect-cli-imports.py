"""Preserve actual graph observations, moved code and bounded startup evidence."""
import json
from pathlib import Path
import re
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '96cd02273937d79cf163461c4c4a6acc76620f15'
read = lambda name: (root / f'ci-logs/cli-startup-imports-{name}.log').read_text()
assert 'fail 1' in read('before') and 'serve imported unrelated' in read('before')
assert 'pass 11' in read('node') and 'fail 0' in read('node')
assert 'pass 2' in read('schema') and 'fail 0' in read('schema')
assert 'pass 1' in read('final-regression') and 'fail 0' in read('final-regression')
assert 'pass 1' in read('rolling') and '[startup-probe] {"code":0' in read('rolling')
before, after = [json.loads((root / f'ci-logs/cli-startup-imports-{name}.json').read_text())
                 for name in ('before', 'after')]
assert before['moduleCount'] == 823 and after['moduleCount'] == 37
assert sum(name.startswith('sources/') for name in before['modules']) == 310
assert not any(name.startswith('sources/') or name == 'server/index.js'
               for name in after['modules'])
original = subprocess.check_output(['git', 'show', f'{parent}:js/src/cli/index.js'],
                                   cwd=root).decode()
commands = (root / 'js/src/cli/commands.js').read_text()
serve = (root / 'js/src/cli/serve-command.js').read_text()
assert original[original.index('const HELP'):original.index('// What `serve` passes')] == (
    commands[commands.index('const HELP'):commands.index('const sourcesCmd')])
body = lambda text: text[text.index('const sourcesCmd'):text.index('export const runCli')]
assert body(original).replace('  serve: serveCmd,\n', '') == body(commands)
start, end = '// What `serve` passes', 'const createServeHandle'
assert original[original.index(start):original.index(end)] == (
    serve[serve.index(start):serve.index(end)].replace('export const serveCmd', 'const serveCmd'))
assert not read('lint') and not read('secrets')
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
assert float(re.findall(r'\(([\d.]+)%\)', total)[0]) <= 6.5
bundle(root, [*changed_sources(root, parent), *evidence_logs(root, 'cli-startup-imports')],
       'docs/case-studies/issue-56/data/ci-cli-imports.tar.gz', {
           'parent': parent, 'parent_assertion_failures': 1, 'focused_node_checks': 14,
           'before_module_count': before['moduleCount'], 'after_module_count': after['moduleCount'],
           'readiness_budget_unchanged_ms': 10000, 'local_observations_not_benchmark': True,
           'remaining': 'Hosted startup confirmation, Questions disclosure, history grouping, all unchecked issue requirements.',
       }, 'no-cli-ui-screenshots/*', before={
           'js/src/cli/index.js': parent, 'js/src/cli/migrate-commands.js': parent,
       })
