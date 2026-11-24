"""Preserve bounded hub regressions, focused checks and exact hosted evidence."""
import hashlib
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'hub-relay')
assert 'All six finite' in read('parent-replay')
assert 'fail 3' in read('parent') and 'fail 3' in read('parent-network')
assert 'pass 73' in read('node-final') and 'fail 0' in read('node-final')
assert 'pass 3' in read('schema') and 'fail 0' in read('schema')
assert 'fail 0' in read('final-dispatch')
assert '[e2e-lino-sync] OK (webkit)' in read('browser')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root) if (root / name).is_file()
           and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'hub-relay')
bundle(root, sources, 'docs/case-studies/issue-56/data/sync-hub-relay.tar.gz',
       dict(published_base='f4a8fac1', parent_failures=6, focused_checks=76,
            native_webkit=True, exact_head_ci_required=True,
            offline_reconciliation_verified=False, full_local_suite=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'issue-56-hub-relay/**/*.png', before={name: 'f4a8fac1' for name in [
           'js/src/sync/peer.js', 'js/src/sync/peer-receiver.js',
           'js/src/storage/mutation.js', 'js/src/storage/universal.js',
           'js/src/storage/browser-store.js']})
