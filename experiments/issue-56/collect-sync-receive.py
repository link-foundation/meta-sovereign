"""Keep finite receive-race regressions and exact hosted fixture failures."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'sync-receive')
assert 'fail 3' in read('before')
assert 'Exact published parent loses the owner edit' in read('parent-replay')
assert 'owner edit survives a remote receive' in read('parent-browser')
assert 'pass 46' in read('node-final') and 'fail 0' in read('node-final')
assert '[e2e-lino-sync] OK (webkit)' in read('browser-after')
assert '"triggered":true,"written":true' in read('browser-after')
assert '"remainingPair":true,"pageErrors":0' in read('browser-after')
assert 'Timeout 20000ms exceeded' in read('existing-document-hash-before')
assert '[e2e-sync-existing-document] OK (webkit)' in read('existing-document-after')
assert not read('lint-final').strip()
assert not read('final-secrets').strip()
assert 'All matched files use Prettier code style!' in read('final-format')
assert 'Changeset validation passed' in read('changeset-validation')
mcp = json.loads((logs / 'sync-receive-mcp-result.json').read_text())
assert not mcp.get('isError')
assert '"ownerEditReplicated":true,"remoteMergeApplied":true,"errors":[]' in mcp['content'][0]['text']
base = 'ea957225'
sources = [name for name in changed_sources(root)
           if name != 'js/src/web/app.min.js' and (root / name).is_file()]
sources += evidence_logs(root, 'sync-receive')
sources += [str(p.relative_to(root)) for p in (logs / 'sync-receive-draft-patch.py',)]
sources += ['ci-logs/checks-43273952312-chromium-1.log',
            'ci-logs/checks-43273952312-webkit-1.log',
            'ci-logs/checks-43271329229-lint.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/sync-receive-isolation.tar.gz',
       dict(published_base=base, focused_node_checks=46, native_webkit=True,
            independent_mcp=True, owner_edit_preserved=True,
            offline_reconciliation_verified=False, full_local_suite=False,
            hosted_spa_failure_run=43273952312,
            hosted_spa_failure_jobs=[131379166066, 131379166190],
            exact_head_ci_required=True),
       'issue-56-sync-receive/**/*.png', before={name: base for name in [
           'js/src/sync/peer.js', 'js/src/storage/universal.js',
           'js/tests/helpers/e2e-sync-peer.mjs']})
