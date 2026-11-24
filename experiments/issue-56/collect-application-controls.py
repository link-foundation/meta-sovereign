"""Preserve the exact published UI absence, final controls and finite evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-ui')
for name, count in [('focused-final', 37), ('ownership-final', 6),
                    ('session', 7), ('i18n-parity', 4)]:
    assert f'pass {count}' in read(name) and 'fail 0' in read(name), name
assert 'missingApplicationControls' in read('before-native')
assert '"entries":1,"submissions":1,"lostResponsePosts":1,"reloadReplayed":false,"errors":[]' in read('native-final')
assert '[e2e-job-application] OK (chromium)' in read('native-final')
mcp = json.loads((logs / 'application-ui-mcp-result.json').read_text())
assert not mcp.get('isError')
text = '\n'.join(item.get('text', '') for item in mcp['content'])
for flag in ['previewRestart', 'pauseResume', 'reversibleDeferral',
             'confirmedDelivery', 'replayBlocked']:
    assert f'"{flag}":true' in text, flag
resources = json.loads((logs / 'application-ui-mcp-resources.json').read_text())
assert resources['closed'] and resources['pageErrors'] == []
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'All matched files' in read('format-final')
assert '6.46%' in read('duplication-final')
assert 'fail 1' in read('focused')  # Retain the original missing SSR fixture.
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application-ui')],
       'docs/case-studies/issue-56/data/application-controls.tar.gz',
       dict(parent='81d553508d4f701ad34c10824cb0c555d788226e',
            focused=43, dictionary_checks=4, native_entries=1, native_submissions=1,
            lost_response_replayed=False, mcp_resources_closed=True,
            authenticated_provider=False, issue_complete=False,
            exact_head_ci_required=True,
            unfinished=['deferred retry queues', 'recovered native forms',
                        'complete session policies', 'original unchecked inventory']),
       'application-*.png', before={'js/src/web/app.min.js': '81d55350'})
