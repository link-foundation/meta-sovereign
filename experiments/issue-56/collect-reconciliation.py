"""Preserve bounded parent/final, transport, durability and native evidence."""
import hashlib
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'reconciliation')
assert 'fail 2' in read('parent')
assert 'pass 45' in read('compatibility') and 'fail 0' in read('compatibility')
assert 'pass 9' in read('secrets-compatibility')
assert '[sync-reconciliation]' in read('browser')
assert '[e2e-lino-sync] OK (webkit)' in read('browser')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
assert 'Changeset validation passed' in read('changeset')
probe = json.loads((logs / 'reconciliation-mcp.json').read_text())
assert not any(probe['before'][key] for key in ['removed', 'edited', 'created'])
assert all(probe['after'][key] for key in ['removed', 'edited', 'created', 'private', 'durableReopen', 'stalePacketRefused'])
assert not probe['after']['errors']
sources = [name for name in changed_sources(root)
           if (root / name).is_file() and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'reconciliation')
bundle(root, sources, 'docs/case-studies/issue-56/data/sync-reconciliation.tar.gz',
       dict(parent='4bfeaf2c', parent_failures=2, focused_sync_passes=45,
            encrypted_compatibility_passes=9, native_webkit=True,
            independent_actual_indexeddb=True, full_local_matrix=False,
            hosted_parent_failures=8, exact_head_ci_required=True,
            issue_complete=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-reconciliation-images-*.png',
       before={name: '4bfeaf2c' for name in ['js/src/sync/peer.js', 'js/src/storage/secret-store.js']})
