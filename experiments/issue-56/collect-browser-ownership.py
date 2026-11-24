"""Preserve bounded browser snapshot conflict and exact-parent evidence."""
import hashlib
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'browser-ownership')
assert 'fail 7' in read('parent')
assert 'fail 1' in read('direct-retry-draft')
for name, passes in [('focused-final', 29), ('compat', 32)]:
    assert f'pass {passes}' in read(name) and 'fail 0' in read(name)
assert '[e2e-browser-storage] OK (webkit)' in read('native')
assert read('native').count('[browser-storage-ownership]') == 2
for name in ['mcp-separate-connections', 'mcp-two-tabs']:
    results = json.loads((logs / f'browser-ownership-{name}.json').read_text())
    assert {result['side'] for result in results} == {'before', 'after'}
    for result in results:
        corrected = result['side'] == 'after'
        assert result['committedSurvives'] == corrected
        assert result['code'] == ('STORE_SNAPSHOT_CHANGED' if corrected else None)
assert not read('lint-final').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
assert 'Changeset validation passed' in read('changeset')
assert 'app.min.js' in read('build-final')
sources = [name for name in changed_sources(root)
           if (root / name).is_file() and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'browser-ownership', ('.log', '.json', '.tsv', '.txt'))
bundle(root, sources, 'docs/case-studies/issue-56/data/browser-snapshot-ownership.tar.gz',
       dict(parent='eefc6f7d531931ef6cea782824c3feb46e549613',
            parent_conflict_failures=7, draft_first_save_retry_failures=1,
            focused_passes=29, overlapping_passes=32,
            native_engine='webkit', native_backends=['indexedDB', 'localStorage'],
            independent_mcp=True, revision_outside_link_records=True,
            local_storage_requires_web_locks=True, full_local_matrix=False,
            exact_head_ci_required=True, automatic_tab_merge_complete=False,
            native_sync_parity_complete=False, issue_complete=False,
            memory_limit_bytes=3135369216,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-browser-ownership-images-*.png',
       before={name: 'eefc6f7d' for name in [
           'js/src/storage/browser-store.js', 'js/tests/browser-store-save.test.js',
           'js/tests/browser-store.test.js', 'js/scripts/browser-checks.json',
           'package.json']})
