"""Preserve bounded merge regressions, real adapters and exact-parent evidence."""
import hashlib
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'register')
assert 'fail 5' in read('parent')
assert 'All five' in read('parent-replay')
assert 'pass 81' in read('focused') and 'fail 0' in read('focused')
assert 'pass 28' in read('storage-focused') and 'fail 0' in read('storage-focused')
assert '[e2e-lino-sync] OK (webkit)' in read('browser')
assert '"left": "B"' in read('mcp') and '"right": "C"' in read('mcp')
assert read('mcp').count('"A"') == 3
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root) if (root / name).is_file()
           and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'register')
sources += ['ci-logs/copy-pool-windows-deno-success.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/sync-register.tar.gz',
       dict(published_base='fc7c095c', parent_failures=5, focused_checks=109,
            native_webkit=True, independent_mcp_indexeddb=True,
            exact_head_ci_required=True, full_local_suite=False,
            native_parity=False, automatic_causal_stamping=False,
            offline_reconciliation=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-sync-register-images-*.png',
       before={'js/src/sync/peer.js': 'fc7c095c'})
