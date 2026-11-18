"""Retain actual snapshot refusal, parent failure and native recovery evidence."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'resume-cache')
checks = {
    'before': ['Unacknowledged CV', 'fail 2'],
    'before-native': ['Rejected discovery must not replace', '1 !== 3'],
    'node': ['pass 30', 'fail 0'],
    'deno': ['30 passed | 0 failed'],
    'native-final': ['"resumeRows":3', '"rejectedWrites":1', '"providerClicks":0',
                     '"recoveryReplayed":false', '"resourcesClosed":true', 'OK (chromium)'],
    'mcp-server': ['"closed":true', '"failedSaves":1', '"pageErrors":[]', '"liveProvider":false'],
    'format-final': ['All matched files use Prettier code style!'],
}
for name, expected in checks.items():
    assert all(fragment in read(name) for fragment in expected), name
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'Found ' in read('duplication-final') and 'ERROR:' not in read('duplication-final')
mcp = json.loads((logs / 'resume-cache-mcp-final.json').read_text())
assert not mcp.get('isError')
receipt = '\n'.join(item.get('text', '') for item in mcp['content'])
assert all(fragment in receipt for fragment in [
    '"resumeRows":3', '"rejectedWrites":1', '"providerClicks":0',
    '"recoveryReplayed":false', '"phone":true', '"resourcesClosed":true', '"errors":[]'])
parent = subprocess.check_output(['git', 'rev-parse', '281d6dcc'], cwd=root, text=True).strip()
sources = changed_sources(root) + evidence_logs(root, 'resume-cache') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/choice-put-fixture.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'js/src/jobs/acknowledged-store.js', 'js/src/storage/acknowledged-record.js',
    'js/src/storage/browser-store.js', '.github/workflows/release.yml',
]
before = {name: parent for name in sources if name.startswith('js/src/') and
          subprocess.run(['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0}
bundle(root, sources, 'docs/case-studies/issue-56/data/resume-cache.tar.gz',
       dict(parent=parent, focused_node=30, focused_deno=30, resume_rows=3,
            rejected_writes=1, provider_clicks=0, automatic_recovery_actions=0,
            phone=True, remaining_original_inventory_rows=81, issue_complete=False,
            parent_ci_failure='two new batch commands absent from lightweight admission',
            exact_head_ci_required=True), 'resume-cache-*.png', before=before)
