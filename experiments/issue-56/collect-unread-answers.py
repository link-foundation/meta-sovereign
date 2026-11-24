"""Preserve finite sequential answers, held review and migration evidence."""
import json
import subprocess
from evidence_bundle import (evidence_context, changed_sources, evidence_logs,
                             verify_evidence, bundle, parent_reply_sources)

root, logs, read = evidence_context(__file__, 'unread-answers')
parent = subprocess.check_output(['git', 'rev-parse', '83fea0ee'], cwd=root).decode().strip()
assert 'pass 0' in read('before-node') and 'fail 1' in read('before-node')
assert 'parent-reads-all-without-preparing-or-holding' in read('before-ui')
verify_evidence(read, {'node': ['pass 17', 'fail 0'],
                       'deno': ['17 passed | 0 failed'],
                       'native': ['first-ordinary-draft-held',
                                  'next-cycle-only-held-chat',
                                  'owner-answer-releases-held-chat'],
                       'ui': ['"cases":1,"liveProvider":false'],
                       'ci-contract': ['pass 2', 'fail 0'],
                       'check': ['All matched files use Prettier code style!']})

def mcp_result(name):
    content = json.loads((logs / f'unread-answers-{name}.json').read_text())
    return json.loads(content['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])

inspection = mcp_result('mcp')
assert len(inspection['cases']) == 4 and inspection['pageErrors'] == []
assert {key: inspection[key] for key in ['scans', 'sends', 'prefills', 'reads', 'pending']} == {
    'scans': 1, 'sends': 1, 'prefills': 1, 'reads': 0, 'pending': 0}
assert inspection['liveProvider'] is False and inspection['senderStub'] is True
localized = mcp_result('locales-mcp')
assert localized['pageErrors'] == []
assert [row['language'] for row in localized['result']] == ['en', 'ru', 'hi', 'zh']
assert all(row['translated'] and row['heldChat'] == '9' for row in localized['result'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'scans': 1, 'pending': 0, 'sends': 1, 'prefills': 1, 'reads': 0,
    'senderStub': True, 'liveProvider': False}
sources = changed_sources(root, parent) + evidence_logs(root, 'unread-answers')
sources += ['experiments/issue-56/question-controls-mcp-setup.mjs',
            'experiments/issue-56/parent_source_probe.py',
            'experiments/issue-56/unread-inspection-server.mjs',
            'experiments/issue-56/question-unread-review-fixture.mjs',
            'experiments/issue-56/chat-navigation-fixture.mjs',
            'js/tests/helpers/e2e-chat-navigation.mjs',
            'js/tests/helpers/question-browser-ui.mjs']
bundle(root, sources, 'docs/case-studies/issue-56/data/unread-answers.tar.gz',
       {'parent': parent, 'focusedNode': 17, 'focusedDeno': 17,
        'nativeCases': 3, 'nativeControls': 1, 'ciContracts': 2,
        'mcpCases': 4, 'mcpLocales': 4, 'liveProvider': False,
        'hostedAcceptance': 'pending', 'acceptedInventoryRows': [],
        'remainingRows': 60}, 'issue-56-unread-answers/*.png',
       before=parent_reply_sources(root, sources, parent))
