"""Preserve native-export publication and exact-parent CI evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'cv-publication-exports')
verify_evidence(read, {
    'before': ['pass 0', 'fail 1', 'jobs-cv-publication-unverified'],
    'node': ['pass 35', 'fail 0'],
    'deno': ['25 passed | 0 failed'],
    'browser': ['nativeExportSource', 'privateExportPreserved', 'recoveryReplayed', 'OK (chromium)'],
    'owner-browser': ['localSnapshotPushes', 'privateIndexPreserved', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for name in ['published', 'recovered']:
    receipt = json.loads((logs / f'cv-publication-exports-mcp-{name}.json').read_text())
    assert receipt['state'] == 'published' and receipt['publishDisabled']
    assert receipt['source'] == '12345678-1234-4321-8123-123456789012:exported123'
    assert not receipt['consent'] and not receipt.get('overflow', False)
server = [json.loads(line) for line in (logs / 'cv-publication-exports-mcp-server.log').read_text().splitlines()]
assert server[-1]['pushes'] == 1 and server[-1]['resourcesClosed'] and not server[-1]['realProvider']
for runtime in ['node', 'deno']:
    value = (logs / f'cv-publication-capabilities-{runtime}.log').read_text()
    assert ('pass 1' if runtime == 'node' else '1 passed | 0 failed') in value
parent = json.loads((logs / 'cv-publication-parent-checks.json').read_text())
assert parent['headSha'] == '9945c26685b9acc14dfba4a192cb2f11628077fc'
sources = changed_sources(root) + evidence_logs(root, 'cv-publication-exports', ('.log', '.json', '.yml'))
sources += evidence_logs(root, 'cv-publication-parent') + evidence_logs(root, 'cv-publication-capabilities')
sources += ['js/tests/vacancy-search.test.js', 'ci-logs/cv-publication-current-runs.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-publication-exports.tar.gz',
       dict(parent=parent['headSha'], focused_node=35, focused_deno=25,
            parent_failures=1, native_local_pushes=1, owner_local_pushes=2,
            mcp_local_pushes=1, provider_sessions=0, private_export_preserved=True,
            status_replayed=False, remaining_original_inventory_rows=81,
            issue_complete=False),
       'issue-56-cv-publication-exports/*.png',
       before={'js/src/jobs/cv-publication-service.js': '9945c266',
               'js/tests/vacancy-search.test.js': '9945c266'})
