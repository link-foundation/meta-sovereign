"""Preserve deletion regressions, failed drafts and actual IndexedDB evidence."""
import hashlib
import json
from evidence_bundle import bundle, changed_sources, evidence_context

root, logs, read = evidence_context(__file__, 'deletions')
assert 'fail 2' in read('parent') and 'Both production' in read('parent-replay')
assert 'pass 47' in read('corrected') and 'fail 0' in read('corrected')
assert 'pass 44' in read('history-corrected') and 'fail 0' in read('history-corrected')
assert 'pass 51' in read('final-focused') and 'fail 0' in read('final-focused')
assert '"deletion":true' in read('browser')
assert 'FAIL (webkit)' in read('browser') and 'Error sending string through RTCDataChannel' in read('browser')
probe = json.loads((logs / 'deletions-mcp.json').read_text())
assert not probe['before']['hiddenAfterOldPacket']
assert probe['before']['afterDelayedDelete'] is None
assert probe['after']['hiddenAfterOldPacket'] and probe['after']['minimalMetadata']
assert probe['after']['afterDelayedDelete'] == 'explicit recreation'
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root) if (root / name).is_file()
           and name not in ['js/src/web/app.min.js', 'js/tests/webrtc-transport.test.js']]
for name in ['parent', 'parent-replay', 'first-focused', 'focused', 'integration',
             'corrected', 'history-final', 'history-corrected', 'index-readonly',
             'draft-history', 'final-focused', 'build', 'browser', 'lint',
             'secrets', 'format-final', 'changeset']:
    sources.append(f'ci-logs/deletions-{name}.log')
sources.append('ci-logs/deletions-mcp.json')
bundle(root, sources, 'docs/case-studies/issue-56/data/causal-deletions.tar.gz',
       dict(parent='a874e936', parent_failures=2, focused_groups=[47, 44, 51],
            groups_overlap=True, native_webkit_pass=False,
            native_webkit_existing_rtc_failure=True, independent_mcp_indexeddb=True,
            exact_head_ci_required=True, full_local_suite=False,
            native_parity=False, offline_reconciliation=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-deletion-images-*.png',
       before={name: 'a874e936' for name in [
           'js/src/storage/causal-writes.js', 'js/src/storage/message-versions.js',
           'js/src/storage/dual-store.js', 'js/src/storage/migrations/node-runner.js']})
