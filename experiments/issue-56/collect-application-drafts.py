"""Preserve the exact published draft loss and finite restoration evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-draft')
for name, count in [('focused-final', 66), ('i18n-final', 4)]:
    assert f'pass {count}' in read(name) and 'fail 0' in read(name), name
assert 'is not a function' in read('before')
assert '404' in read('before-native')
assert "actual: 'partial'" in read('native')
native = read('native-exact-final')
for value in ['"backedUp":2', '"restored":2', '"submissions":0',
              '"learned":false', '"ownedBrowsersClosed":true', '"errors":[]']:
    assert value in native, value
parent = json.loads((logs / 'application-draft-before-mcp-result.json').read_text())
assert parent['parentMissingBackup'] and parent['parentOwnerAnswersLost']
assert parent['pageErrors'] == []
mcp = json.loads((logs / 'application-draft-mcp-final.json').read_text())
assert not mcp.get('isError')
text = '\n'.join(item.get('text', '') for item in mcp['content'])
for value in ['"actualOwnerDraft":true', '"confirmationRequired":true',
              '"readOnlyReopen":true', '"restored":2', '"submissions":0',
              '"ownerHeaderPreserved":true', '"privateIntent":true', '"pageErrors":[]']:
    assert value in text, value
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'All matched files' in read('format-final')
assert '6.49%' in read('duplication-final')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application-draft')],
       'docs/case-studies/issue-56/data/application-drafts.tar.gz',
       dict(parent='4f482c34def7547590889f0639fd1dca81baacf1',
            focused=66, dictionary_checks=4, native_restored=2,
            recovered_entries=0, native_submissions=0, learned=False,
            authenticated_provider=False, issue_complete=False,
            exact_head_ci_required=True,
            unfinished=['automatic deferral backups', 'RAM-only deferred queue',
                        'run-wide modes and supervised preset',
                        'popup recovery', 'original unchecked inventory']),
       'application-draft-*.png', before={
           name: '4f482c34' for name in [
               'js/src/jobs/application-service.js',
               'js/src/jobs/application-journal.js',
               'js/src/forms/review-prefill.js',
               'js/src/web/application-panel.js', 'js/src/web/app.min.js']})
