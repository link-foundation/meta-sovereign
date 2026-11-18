"""Preserve finite browser durability regressions and actual IndexedDB evidence."""
import hashlib
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'browser-save')
assert 'fail 3' in read('parent')
assert 'All three finite durability regressions fail' in read('parent-replay')
assert 'pass 64' in read('focused') and 'fail 0' in read('focused')
assert '[e2e-lino-sync] OK (webkit)' in read('browser')
assert '"persisted": "before"' in read('mcp')
assert '"persisted": "after"' in read('mcp')
assert '"maximumActive": 1' in read('mcp')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root) if (root / name).is_file()
           and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'browser-save')
bundle(root, sources, 'docs/case-studies/issue-56/data/browser-snapshot-order.tar.gz',
       dict(published_base='ff43da4f', parent_failures=3, focused_checks=64,
            native_webkit=True, independent_mcp_indexeddb=True,
            exact_head_ci_required=True, full_local_suite=False,
            multi_tab_coordination=False, offline_reconciliation=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-browser-snapshot-order-images-*.png',
       before={'js/src/storage/browser-store.js': 'ff43da4f'})
