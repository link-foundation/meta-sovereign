"""Preserve finite browser-tab convergence checks and exact-parent failures."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'browser-tabs')
assert 'pass 39' in read('focused') and 'fail 0' in read('focused')
assert 'both editable tabs must save' in read('parent')
assert "code: 'STORE_SNAPSHOT_CHANGED'" in read('parent')
assert 'fail 1' in read('drain-draft') and 'true !== false' in read('drain-draft')
assert '[e2e-browser-merge] OK (webkit)' in read('native')
assert read('native').count('[browser-tab-merge]') == 2
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('prettier')
assert '6.47%' in read('duplication') and 'ERROR: jscpd' not in read('duplication')
assert not read('secrets').strip()
for kind in ['indexedDB', 'localStorage']:
    before = json.loads((logs / 'browser-tabs-mcp-before.json').read_text())[kind]
    second = json.loads((logs / 'browser-tabs-mcp-second.json').read_text())[kind]
    live = json.loads((logs / 'browser-tabs-mcp-live.json').read_text())[kind]
    deleted = json.loads((logs / 'browser-tabs-mcp-delete.json').read_text())[kind]
    assert before['parentFailure'] == 'STORE_SNAPSHOT_CHANGED'
    assert second['accountIsolated'] and second['firstVisible'] == 'first owner'
    assert second['secondSaved'] == live['remoteVisible'] == 'second owner'
    assert deleted['deletionVisible'] and deleted['secondRetained'] == 'second owner'
bundle(root, changed_sources(root) + evidence_logs(root, 'browser-tabs'),
       'docs/case-studies/issue-56/data/browser-tab-merge.tar.gz',
       dict(parent='1e90229508cfe71ca8c47a5e15924acf2681b5dd',
            focused_tests=39, merge_tests=12, compatibility_tests=23,
            browser_registry_tests=4, local_browser='webkit',
            native_two_tab_drivers=['indexedDB', 'localStorage'],
            independent_mcp_verified=True, draft_drain_failure_retained=True,
            unchanged_duplication_threshold=6.5, full_local_matrix=False,
            exact_head_ci_required=True, issue_complete=False),
       'no-browser-tab-merge-images-*',
       before={name: '1e902295' for name in [
           'js/src/storage/browser-store.js',
           'js/src/storage/browser-snapshot.js', 'js/src/web/dom.js']})
