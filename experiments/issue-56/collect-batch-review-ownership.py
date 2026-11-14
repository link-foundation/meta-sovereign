"""Preserve exact-head batch failures, ownership recovery and clock regression."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'batch-review-ownership')
checks = {
    'before': ['fail 2', 'pass 1'],
    'before-native': ['element is not enabled'],
    'clock-before': ['jobs-application-batch-recovery', 'fail 1'],
    'clock-node': ['pass 1', 'fail 0'],
    'clock-deno': ['1 passed | 0 failed'],
    'node': ['pass 16', 'fail 0'],
    'deno': ['4 passed | 0 failed'],
    'native-final': ['[e2e-job-application-batch] OK (chromium)',
                     '"deliveries":2', '"queueRevisits":2',
                     '"entryClicks":0', '"resourcesClosed":true'],
    'format-check': ['All matched files use Prettier code style!'],
}
verify_evidence(read, checks)
receipt = json.loads((logs / 'batch-review-ownership-mcp-final.json').read_text())
assert not receipt.get('isError'), receipt
text = '\n'.join(row.get('text', '') for row in receipt['content'])
assert all(value in text for value in ['"deliveries":1', '"sends":1',
    '"entries":0', '"recoveryReplayed":false', '"errors":[]'])
closed = json.loads((logs / 'batch-review-ownership-mcp-closed.json').read_text())
assert closed['closed'] and closed['opens'] == 4 and closed['providerClicks'] == 0
sources = changed_sources(root, revision='c008d5f1') + evidence_logs(root, 'batch-review-ownership') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application_native_probe.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-batch-fixture.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-mcp-server.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/e2e-application-batch.mjs',
    'js/tests/e2e-job-application-batch-browser.mjs',
]
parent = '8007a002e94eafaccc5f45c5de2b8073a264d6bf'
bundle(root, sources, 'docs/case-studies/issue-56/data/batch-review-ownership.tar.gz',
       dict(parent=parent, focused_node=16, focused_deno=4,
            parent_service_failures=2, parent_native_disabled_control=True,
            parent_workflow=43635159024,
            parent_failing_browser_jobs=[132572456753, 132572456912],
            clock_parent_failures=1, clock_node=1, clock_deno=1,
            native_deliveries=2, native_revisits=2, mcp_sends=1,
            application_entries=0, recovery_replayed=False, locales=4,
            resources_closed=True, production_deadlines_changed=False,
            remaining_original_inventory_rows=81, issue_complete=False),
       'batch-review-ownership-*.png', before={name: parent for name in [
           'js/src/web/application-panel.js', 'js/src/jobs/application-batch.js']})
