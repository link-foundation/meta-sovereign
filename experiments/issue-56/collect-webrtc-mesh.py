"""Preserve exact-parent mesh failure, focused checks and independent MCP evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'lino-sync-mesh')
assert 'Expected actual-parent three-peer convergence failure' in read('parent')
assert 'pass 18' in read('node') and 'fail 0' in read('node')
assert '[e2e-lino-sync] OK (webkit)' in read('native')
assert '"connectedReload":true' in read('native')
assert '"remainingPair":true' in read('native')
assert not read('lint').strip() and not read('mcp-lint').strip()
assert not read('final-lint').strip() and not read('final-secrets').strip()
assert 'All matched files use Prettier code style!' in read('final-format')
assert 'Changeset validation passed' in read('changeset-validation')
mcp = json.loads((logs / 'lino-sync-mesh-mcp-result.json').read_text())
assert not mcp.get('isError')
assert '"remainingPair":true' in mcp['content'][0]['text']
assert json.loads((logs / 'lino-sync-mesh-mcp-control.json').read_text()) == {
    'serverApplicationRecords': 0}
base = '3483c8b1f623a8220bdb8adaa83de372da2b8c7d'
sources = [name for name in changed_sources(root, base)
           if name != 'js/src/web/app.min.js' and (root / name).is_file()]
sources += evidence_logs(root, 'lino-sync-mesh')
sources += ['ci-logs/checks-43266303454-changesets.log',
            'ci-logs/lino-sync-integration-browser.log',
            'ci-logs/lino-sync-integration-node.log',
            'ci-logs/lino-sync-integration-lint.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/webrtc-mesh.tar.gz',
       dict(published_base=base, focused_node_checks=18,
            native_webkit=True, independent_mcp=True, peers=3,
            connected_reload=True, fresh_bidirectional_writes=True,
            offline_reconciliation_verified=False, full_local_suite=False,
            hosted_changeset_run=43266303454, hosted_changeset_job=131351156787,
            exact_head_ci_required=True),
       'issue-56-webrtc-mesh/**/*.png', before={name: base for name in [
           'js/src/web/webrtc-sync.js', 'js/src/sync/webrtc-signaling.js',
           'js/src/sync/bun-server.js', 'js/src/sync/webrtc-transport.js',
           '.changeset/cv-translation-comparison.md']})
