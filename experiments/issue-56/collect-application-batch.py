"""Retain finite batch regressions, native/MCP receipts and actual parent sources."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-batch')
checks = {
    'before': ['paced batch orchestration is absent'],
    'before-native': ['finite paced batch controls are absent'],
    'node': ['pass 64', 'fail 0'],
    'deno': ['30 passed | 0 failed'],
    'native-final': ['"deliveries":2', '"manualDeliveries":1', '"queueRevisits":2',
                     '"entryClicks":0', '"locales":4', '"phone":true',
                     '"reloadReplayed":false', '"resourcesClosed":true',
                     'OK (chromium)'],
    'mcp-server': ['"closed":true', '"pageErrors":[]', '"liveProvider":false'],
    'format-final': ['All matched files use Prettier code style!'],
}
for name, expected in checks.items():
    assert all(fragment in read(name) for fragment in expected), name
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'Found ' in read('duplication-final') and 'ERROR:' not in read('duplication-final')
mcp = json.loads((logs / 'application-batch-mcp-final.json').read_text())
assert not mcp.get('isError')
receipt = '\n'.join(item.get('text', '') for item in mcp['content'])
assert all(fragment in receipt for fragment in [
    '"deliveries":1', '"queueRevisits":1', '"entries":0', '"sends":1',
    '"locales":4', '"phone":true', '"recoveryReplayed":false',
    '"resourcesClosed":true', '"errors":[]'])
parent = subprocess.check_output(['git', 'rev-parse', 'af668771'], cwd=root, text=True).strip()
runs = json.loads((logs / 'application-batch-prior-runs.json').read_text())
assert len(runs) == 5 and all(
    row['headSha'] == parent and row['conclusion'] == 'success' for row in runs)
sources = changed_sources(root) + evidence_logs(root, 'application-batch') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application_native_probe.py',
    'experiments/issue-56/compose-application-mcp.py',
    'js/src/jobs/application-journal.js', 'js/src/forms/automatic-prefill.js',
    '.github/workflows/release.yml',
]
before = {name: parent for name in sources if name.startswith('js/src/') and
          not name.endswith('app.min.js') and subprocess.run(
              ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0}
bundle(root, sources, 'docs/case-studies/issue-56/data/application-batch.tar.gz',
       dict(parent=parent, focused_node=64, focused_deno=30,
            native_deliveries=2, native_manual_deliveries=1,
            native_queue_revisits=2, mcp_deliveries=1, mcp_queue_revisits=1,
            mcp_sends=1, entry_clicks=0, automatic_recovery_actions=0,
            locales=4, phone=True, remaining_original_inventory_rows=81,
            issue_complete=False, automatic_discovery_required=True,
            authenticated_account_scope_required=True, exact_head_ci_required=True),
       'application-batch-*.png', before=before)
