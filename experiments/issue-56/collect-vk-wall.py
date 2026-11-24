"""Preserve finite community-wall verification without claiming live delivery."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-wall')
verify_evidence(read, {
    'before-node': ['fail 1', 'wallInviteSnapshot', 'undefined'],
    'before-ui': ['"missingWallControls":true', '"providerEffects":0'],
    'node-final': ['pass 28', 'fail 0'],
    'deno-final': ['28 passed | 0 failed'],
    'lifecycle-node': ['pass 9', 'fail 0'],
    'lifecycle-deno': ['9 passed | 0 failed'],
    'workflow-contracts': ['pass 7', 'fail 0'],
    'native-final': ['"postBeforeDelete":true', '"partialWithoutRepost":true',
                     '"unknownRetained":true', '"failedSaveRetained":true',
                     '"syntheticCalls":4', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
raw = json.loads((logs / 'vk-wall-mcp-result.json').read_text())
summary = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert [r['language'] for r in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(r[k] for k in ['translated', 'nativeReview', 'postBeforeDelete',
                             'deduplication', 'automaticOff']) for r in summary['result'])
assert json.loads(read('mcp-server-final').splitlines()[-1]) == {
    'syntheticWallCalls': 2, 'unexpectedMessages': 0,
    'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-wall').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
for language in ['', '.ru', '.hi', '.zh']:
    assert 'vk-wall' in (root / f'docs/VK-COMMUNITY-INVITATIONS{language}.md').read_text()
parent = '05bcbdddaf71edbff1e9dc3c6eb46615ae41599f'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-wall')
receipts += evidence_logs(root, 'vk-invites', suffixes=('.js', '.json', '.log'))
receipts += ['ci-logs/vk-wall-mcp-code.js',
             'ci-logs/vk-wall-production-review.diff',
             'ci-logs/vk-wall-shared-review.diff',
             'ci-logs/checks-43705703714.zip',
             'ci-logs/checks-43705703714-download.log',
             'ci-logs/checks-macos-node-43705703714.log']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-wall.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1,
    'new_feature_checks': 18, 'node_focused_checks': 28,
    'deno_focused_checks': 28, 'latest_lifecycle_checks_per_runtime': 9,
    'workflow_contract_checks': 7, 'guide_languages': 4,
    'native_synthetic_attempts_including_refusal_unknown': 4,
    'independent_mcp_languages': 4, 'synthetic_mcp_calls': 2,
    'live_provider_effects': 0, 'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'issue_complete': False,
}, 'issue-56-vk-wall/*.png', before=parent_reply_sources(root, work, parent))
