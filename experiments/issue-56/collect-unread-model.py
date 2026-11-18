"""Retain bounded configured-model drafts, actual-parent failure and UI proof."""
import json
import subprocess
from evidence_bundle import (evidence_context, changed_sources, evidence_logs,
                             verify_evidence, bundle, parent_reply_sources)

root, logs, read = evidence_context(__file__, 'unread-model')
parent = subprocess.check_output(['git', 'rev-parse', '210ef3b0'], cwd=root).decode().strip()
assert 'pass 0' in read('before-node') and 'fail 1' in read('before-node')
verify_evidence(read, {
    'node': ['pass 21', 'fail 0'], 'deno': ['21 passed | 0 failed'],
    'before-browser': ['"modelCalls":0', '"before":true'],
    'after-browser': ['"modelCalls":1', '"before":false'],
    'controls': ['"cases":1', '"liveProvider":false'],
    'ci-registration': ['pass 2', 'fail 0'],
    'check': ['All matched files use Prettier code style!'],
})
inspection = json.loads((logs / 'unread-model-mcp-result.json').read_text())
assert inspection['cases'] == 4 and inspection['pageErrors'] == []
assert [row['language'] for row in inspection['locales']] == ['en', 'ru', 'hi', 'zh']
assert all(row['translated'] and row['defaultOff'] for row in inspection['locales'])
assert {key: inspection[key] for key in ('modelCalls', 'prefills', 'sends', 'reads', 'pending')} == {
    'modelCalls': 1, 'prefills': 1, 'sends': 0, 'reads': 0, 'pending': 0}
assert inspection['liveProvider'] is False and inspection['senderStub'] is True
server = json.loads(read('mcp-server').splitlines()[-1])
assert all(server[key] == inspection[key] for key in server)
sources = changed_sources(root) + evidence_logs(root, 'unread-model')
sources += ['experiments/issue-56/forms-model-fixture.mjs',
            'experiments/issue-56/chat-navigation-fixture.mjs',
            'experiments/issue-56/parent_source_probe.py',
            'js/tests/helpers/e2e-chat-navigation.mjs',
            'js/tests/helpers/question-browser-ui.mjs',
            'ci-logs/unread-model-mcp-code.js']
bundle(root, sources, 'docs/case-studies/issue-56/data/unread-model.tar.gz',
       {'parent': parent, 'focusedNode': 21, 'focusedDeno': 21,
        'nativeCases': 1, 'nativeControls': 1, 'ciContracts': 2,
        'mcpCases': 4, 'mcpLocales': 4, 'liveProvider': False,
        'hostedAcceptance': 'pending', 'acceptedInventoryRows': [],
        'remainingRows': 60}, 'issue-56-unread-model/*.png',
       before=parent_reply_sources(root, sources, parent))
