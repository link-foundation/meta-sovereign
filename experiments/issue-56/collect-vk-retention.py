"""Preserve finite history-retention evidence without claiming live deletion."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-retention')
verify_evidence(read, {
    'before-node': ['fail 1', 'retentionSnapshot', 'undefined'],
    'before-ui': ['"missingRetentionControls":true', '"liveProvider":false'],
    'node-final': ['pass 32', 'fail 0'],
    'deno-final': ['31 passed | 0 failed | 1 ignored'],
    'shared-final-node': ['pass 38', 'fail 0'],
    'shared-final-deno': ['38 passed | 0 failed'],
    'shared-guards-node': ['pass 20', 'fail 0'],
    'native-final': ['"reviewedRetention":true', '"remainingOnlyRecovery":true',
                     '"recoverableLocalMessages":103', '"providerCalls":4',
                     '"pageErrors":0', '"liveProvider":false'],
    'format-final': ['All matched files use Prettier code style!'],
})
raw = json.loads((logs / 'vk-retention-mcp-result.json').read_text())
summary = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert [r['language'] for r in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(r[k] for k in ['translated', 'reviewedRetention',
                             'confirmedRecovery', 'automaticOff']) for r in summary['result'])
assert json.loads(read('mcp-server-final').splitlines()[-1]) == {
    'syntheticRetentionCalls': 1, 'localTombstones': 3,
    'unexpectedMessages': 0, 'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-retention').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
for language in ['', '.ru', '.hi', '.zh']:
    assert 'vk-retention' in (root / f'docs/VK-HISTORY-RETENTION{language}.md').read_text()
parent = '3ea98ecc02691b967cc0723aa99cc6807caf625f'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-retention', suffixes=('.log', '.json', '.js', '.png'))
receipts += ['ci-logs/vk-retention-production-review.diff']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-retention.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1,
    'new_feature_checks': 18, 'node_focused_checks': 32,
    'deno_focused_checks': 31, 'deno_runtime_specific_skips': 1,
    'shared_guard_checks': 20, 'shared_compatibility_checks_per_runtime': 38,
    'guide_languages': 4, 'native_partial_recovery': True,
    'independent_mcp_languages': 4, 'synthetic_mcp_calls': 1,
    'native_reviewed_messages': 103, 'live_provider_effects': 0,
    'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'issue_complete': False,
}, 'issue-56-vk-retention/*.png', before=parent_reply_sources(root, work, parent))
