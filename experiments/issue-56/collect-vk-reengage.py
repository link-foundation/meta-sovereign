"""Preserve finite ordered VK conversation checks and actual-parent evidence."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-reengage')
verify_evidence(read, {
    'before-node': ['fail 1', 'undefined'],
    'before-ui': ['"missingReengageControls":true', '"providerEffects":0'],
    'node-final': ['pass 71', 'fail 0'],
    'node-latest': ['pass 14', 'fail 0'],
    'deno-final': ['52 passed | 0 failed'],
    'native-final': ['"orderedAudioReview":true', '"durableCooldown":true',
                     '"independentPolicies":true', '"failedSaveRetained":true',
                     '"syntheticCalls":4', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
raw = json.loads((logs / 'vk-reengage-mcp-result.json').read_text())
summary = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert [r['language'] for r in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(r[k] for k in ['translated', 'orderedReview', 'cooldown', 'automaticOff'])
           for r in summary['result'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'syntheticSequenceCalls': 3, 'unexpectedMessages': 0,
    'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-reengage').glob('*.png'))
assert len(shots) == 10
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
for language in ['', '.ru', '.hi', '.zh']:
    page = (root / f'docs/VK-DORMANT-CONVERSATIONS{language}.md').read_text()
    assert 'vk-music' in page and 'vk-topic' in page and 'vk-help' in page
parent = '4bd81d2e27f466081909693bfab502f149fd4265'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-reengage')
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-proactive-reference-*.js')]
receipts += ['ci-logs/vk-reengage-mcp-code.js',
             'ci-logs/vk-reengage-production-review.diff',
             'ci-logs/vk-reengage-shared-review.diff']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-reengage.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1,
    'node_focused_checks': 71, 'node_latest_feature_checks': 14,
    'deno_focused_checks': 52, 'guide_languages': 4,
    'native_synthetic_calls_including_refusal': 4,
    'independent_mcp_languages': 4, 'synthetic_mcp_calls': 3,
    'live_provider_effects': 0, 'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'issue_complete': False,
}, 'issue-56-vk-reengage/*.png', before=parent_reply_sources(root, work, parent))
