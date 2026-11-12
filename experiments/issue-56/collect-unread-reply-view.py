"""Preserve original-chat reveal, delivery independence and recovery evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'unread-reply-view')
parent = '123947451a46c18dcc94f1d424c9f66dc13f8a7b'
for runtime, expected in [('node', 'pass 30'), ('deno', '30 passed | 0 failed'),
                          ('registry', 'pass 1'), ('registry-deno', '1 passed | 0 failed')]:
    assert expected in read(f'{runtime}-verified')
assert 'fail 1' in read('before-node')
assert 'must remain visible' in read('before-browser')
assert 'Restored all four working sources' in read('before-summary')
native = json.loads(read('native-verified').splitlines()[-1])['native']
controls = json.loads(read('controls-verified').splitlines()[-1])['controls']
mcp = json.loads((logs / 'unread-reply-view-mcp-verified.json').read_text())
assert native['cases'] == 4 and controls['cases'] == 4
assert not controls['pageErrors']
assert len(mcp['cases']) == 5 and mcp['scans'] == 2 and mcp['sends'] == 2
assert not any(mcp[key] for key in ('pending', 'prefills', 'reads', 'pageErrors'))
assert not read('lint-verified').strip() and not read('secretlint-verified').strip()
assert 'ERROR' not in read('duplication-verified')
assert 'All matched files use Prettier code style!' in read('format-check-verified')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'unread-reply-view'),
              'ci-logs/unread-fixture-job-130920222136-completed.log'],
       'docs/case-studies/issue-56/data/unread-reply-view.tar.gz',
       dict(parent=parent, focused_per_runtime=30, registry_per_runtime=1,
            native=native, controls=controls, mcp=mcp,
            original_empty_chat_reveal=True, polling=False,
            authenticated_provider=False,
            unfinished='Polling/backoff/lifetime, QA17/HH09/HH10 and every unchecked issue criterion'),
       'issue-56-unread-reply-view/*.png', before={name: parent for name in (
           'js/src/sources/browser-chat-navigation.js',
           'js/src/sources/browser-chat-view-state.js',
           'js/src/sources/browser-conversation-tail.js',
           'js/src/sources/browser-unread-conversations.js',
           'js/src/web/question-browser-controls.js',
           'js/src/web/question-unread-controls.js')})
