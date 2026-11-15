"""Preserve finite friendship follow-up checks and independently reviewed UI."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-cancelled')
verify_evidence(read, {
    'before-node': ['fail 1', 'VK user-token friend API required'],
    'before-ui': ['"missingFollowUpControls":true', '"providerEffects":0'],
    'parent': ['all production sources restored.'],
    'node-final': ['pass 19', 'fail 0'],
    'deno-final': ['14 passed | 0 failed'],
    'compat-node': ['pass 43', 'fail 0'],
    'native': ['"honestEvidence":true', '"reviewedMessage":true',
               '"savedText":true', '"noRepeat":true',
               '"separateBlockingConsent":true', '"unknownRetained":true',
               '"failedSaveRetained":true', '"syntheticPromptCalls":2',
               '"syntheticBlockCalls":1', '"pageErrors":0'],
    'compat-native': ['"priorityFirst":true', '"reviewedActions":true',
                      '"confirmed":true', '"refused":true',
                      '"unknownRetained":true', '"failedSaveRetained":true'],
    'desktop-native': ['"savedPolicy":true', '"lifetimeQuota":true',
                       '"mutualOnly":true', '"syntheticFriendCalls":5',
                       '"messages":0', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
raw = json.loads((logs / 'vk-cancelled-mcp-result.json').read_text())
summary = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert [row['language'] for row in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(row[key] for key in [
    'translated', 'honestEvidence', 'reviewed', 'noRepeat', 'blockingOff', 'savedText'
]) for row in summary['result'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'syntheticPromptCalls': 1, 'syntheticBlockCalls': 0,
    'unexpectedMessages': 0, 'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-cancelled').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
parent = 'b0bb53aef2fd7556baabfbe6f51103659ce25ef2'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-cancelled')
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-cancelled-reference-*.js')]
receipts += [f'ci-logs/vk-friends-schema-{name}.json' for name in [
    'methods', 'responses', 'objects']]
receipts += ['ci-logs/vk-online-reference-index.js',
             'ci-logs/vk-online-reference-index-blob.json',
             'ci-logs/vk-cancelled-mcp-code.js',
             'ci-logs/vk-cancelled-verified-app.min.js',
             'ci-logs/vk-cancelled-production-review.diff']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-cancelled.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1, 'node_feature_checks': 14,
    'deno_feature_checks': 14, 'registry_checks': 5, 'compatibility_checks': 43,
    'native_policy_cases': 1, 'native_synthetic_prompts': 2,
    'native_synthetic_blocks': 1, 'independent_mcp_languages': 4,
    'synthetic_mcp_prompts': 1, 'live_provider_effects': 0,
    'authenticated_provider_sessions': 0, 'hosted_verification_pending': True,
    'issue_complete': False,
}, 'issue-56-vk-cancelled/*.png', before=parent_reply_sources(root, work, parent))
