"""Preserve finite ordinary-write admission and real browser evidence."""
import hashlib
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'causal')
assert 'fail 2' in read('parent') and 'Both ordinary' in read('parent-replay')
assert 'pass 63' in read('focused') and 'fail 0' in read('focused')
assert 'pass 75' in read('integration') and 'fail 0' in read('integration')
assert 'pass 7' in read('storage-final') and 'fail 0' in read('storage-final')
assert '[e2e-lino-sync] OK (webkit)' in read('browser')
assert '"ordinary":true,"advanced":true,"remote":true' in read('browser')
probe = json.loads(read('mcp'))
assert probe['before']['delayedPacket'] == 'z'
assert probe['before']['afterReopen'] == 'a'
assert probe['after']['delayedPacket'] == 'a'
assert probe['after']['afterReopen'] == '0'
assert probe['after']['distinctOpeningActors']
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root) if (root / name).is_file()
           and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'causal')
bundle(root, sources, 'docs/case-studies/issue-56/data/causal-writes.tar.gz',
       dict(published_base='96a54d99', parent_failures=2, focused_groups=[63, 75, 7],
            groups_overlap=True, native_webkit=True, independent_mcp_indexeddb=True,
            exact_head_ci_required=True, full_local_suite=False,
            native_parity=False, offline_reconciliation=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-causal-images-*.png',
       before={name: '96a54d99' for name in [
           'js/src/storage/dual-store.js', 'js/src/storage/browser-store.js',
           'js/src/server/index.js', 'js/src/storage/message-versions.js']})
