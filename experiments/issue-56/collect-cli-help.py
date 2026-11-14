"""Verify exact usage compatibility and import admission before archiving."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cli-help')
for name, fragments in {
    'before': ('Help imported the ordinary/provider graph.', 'fail 1'),
    'focused-final': ('pass 16', 'fail 0'),
    'deno-final': ('13 passed | 0 failed | 3 ignored',),
    'format-final': ('All matched files use Prettier code style!',),
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
before = json.loads((logs / 'cli-help-parent-imports.json').read_text())
after = json.loads((logs / 'cli-help-final-imports.json').read_text())
assert before['codes'] == after['codes'] == [0, 0, 0, 0, 1]
assert before['outputHashes'] == after['outputHashes']
assert before['moduleCount'] == 793 and after['moduleCount'] == 9
assert 'cli/commands.js' in before['modules'] and 'cli/commands.js' not in after['modules']
assert not any(name.startswith(('sources/', 'jobs/', 'assignments/')) for name in after['modules'])
duplication = read('duplication-final')
assert 'Found ' in duplication and 'HTML report saved' in duplication
assert 'ERROR:' not in duplication and 'MODULE_NOT_FOUND' not in duplication
parent = 'fffdc0b2a8a3f91e66eba445e0a6a7dbd3285414'
sources = changed_sources(root) + evidence_logs(root, 'cli-help')
sources += ['experiments/issue-56/application_parent_fixture.py',
            'experiments/issue-56/cli-import-observation.mjs',
            'ci-logs/checks-43606682331-windows-deno-1.log',
            'ci-logs/ci-cd2a-windows-deno-annotations.json',
            'ci-logs/ci-cd2a-latest.json']
before_sources = [name for name in sources if name.startswith('js/src/cli/')
                  and name not in ('js/src/cli/help.js', 'js/src/cli/command-names.js')]
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-cli-help-startup.tar.gz',
       dict(published_parent=parent, original_failure_head='cd2a3337',
            original_windows_delay_reproduced=False, source_modules_before=793,
            source_modules_after=9, ordinary_commands=116, exact_help_bytes=True,
            node_passed=16, deno_passed=13, deno_ignored_node_hooks=3,
            original_incomplete_rows=81, issue_complete=False,
            exact_head_ci_required=True),
       'no-cli-help-screenshots-expected', before={name: parent for name in before_sources})
