"""Preserve exact-parent CLI admission failures and the focused correction."""
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'batch-cli-admission')
for name, expected in {
    'before': ['Missing expected rejection', 'lightweight admission retains', 'fail 2'],
    'parent-probe': ['actual sources restored'],
    'node': ['pass 12', 'fail 0'],
    'deno': ['11 passed | 0 failed | 1 ignored'],
    'format': ['All matched files use Prettier code style!'],
}.items():
    assert all(fragment in read(name) for fragment in expected), name
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
jobs = sorted(logs.glob('batch-cli-admission-parent-job-*.log'))
assert len(jobs) == 8
for path in jobs:
    text = path.read_text()
    assert all(fragment in text for fragment in [
        'AssertionError', 'vacancies-application-batch', 'cli-help-imports.test.js'])
parent = subprocess.check_output(['git', 'rev-parse', '281d6dcc'], cwd=root, text=True).strip()
sources = changed_sources(root) + evidence_logs(root, 'batch-cli-admission') + [
    'experiments/issue-56/application_parent_fixture.py',
    'js/tests/cli-help-imports.test.js', 'js/tests/cli-output.test.js',
    'js/tests/job-application-batch-controls.test.js', 'js/src/cli/index.js',
    'js/src/cli/commands.js', 'js/src/cli/application-batch-command.js',
]
before = {name: parent for name in ['js/src/cli/command-names.js', 'js/src/cli/index.js']}
bundle(root, sources, 'docs/case-studies/issue-56/data/batch-cli-admission.tar.gz',
       dict(parent=parent, focused_node=12, focused_deno=11, ignored_node_hook=1,
            failed_parent_jobs=8, changed_deadlines=False,
            remaining_original_inventory_rows=81, issue_complete=False,
            exact_head_ci_required=True), 'batch-cli-admission-*.png', before=before)
