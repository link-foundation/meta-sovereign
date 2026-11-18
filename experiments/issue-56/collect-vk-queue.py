"""Require finite queue regressions, native/MCP evidence and strict gates."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    bundle, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'vk-queue')
verify_evidence(read, {
    'before-node': ['fail 1', 'messages.markAsRead'],
    'before-ui': ['"missingQueueControls":true'],
    'node': ['pass 48', 'fail 0', 'cancelled 0'],
    'deno': ['48 passed | 0 failed'],
    'native': ['"retainedAcknowledgedSettings":true',
               '"separateDeliveryAndProgress":true', '"peerDraftCount":1',
               '"syntheticMessages":2', '"reloadDoesNotReplay":true',
               '"pageErrors":0', '"liveProvider":false'],
    'format-final': ['All matched files use Prettier code style!'],
})
raw = json.loads((logs / 'vk-queue-mcp-final-result.json').read_text())
result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result['errors'] == [] and result['liveProvider'] is False
assert [item['language'] for item in result['result']] == ['en', 'ru', 'hi', 'zh']
assert all(item['translated'] and item['retainedSettings']
           and item['providerFreeInspection'] for item in result['result'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'syntheticCalls': 4, 'messages': 1, 'liveProvider': False,
    'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-queue').glob('*.png'))
assert len(shots) == 10
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
sources = changed_sources(root)
references = evidence_logs(root, 'vk-runner', ('.js', '.json'))
references += ['ci-logs/vk-discovery-reference-outgoing.js']
parent = '5155e22b2b8e7e40b21d4766dd04f75044f41c53'
bundle(root, sources + evidence_logs(root, 'vk-queue', ('.log', '.json', '.js'))
       + references, 'docs/case-studies/issue-56/data/vk-queue.tar.gz', {
           'parent': parent, 'node_passed': 48, 'deno_passed': 48,
           'native_browser': 'webkit', 'mcp_languages': ['en', 'ru', 'hi', 'zh'],
           'live_provider_effects': 0, 'hosted_verification_pending': True,
           'initial_live_peer_history_audit_pending': True,
           'issue_complete': False,
       }, 'issue-56-vk-queue/*.png',
       before=parent_reply_sources(root, sources, parent))
