"""Preserve bounded proactive greeting checks and four-language browser evidence."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-proactive')
verify_evidence(read, {
    'before-node': ['fail 1', 'VK user-token friend API required'],
    'before-ui': ['"missingGreetingControls":true', '"providerEffects":0'],
    'node-final': ['pass 28', 'fail 0'],
    'deno-final': ['28 passed | 0 failed'],
    'registry-node-final': ['pass 9', 'fail 0'],
    'native-final': ['"savedFilters":true', '"exactReview":true',
                     '"cooldown":true', '"unknownRetained":true',
                     '"failedSaveRetained":true', '"syntheticGreetingCalls":2',
                     '"pageErrors":0'],
    'compat-native-final': ['"honestEvidence":true', '"reviewedMessage":true',
                            '"noRepeat":true', '"separateBlockingConsent":true',
                            '"syntheticPromptCalls":2', '"syntheticBlockCalls":1',
                            '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
raw = json.loads((logs / 'vk-proactive-mcp.log').read_text())
summary = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert [r['language'] for r in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(r[k] for k in ['translated', 'reviewed', 'savedText',
                              'cooldown', 'automaticOff']) for r in summary['result'])
assert json.loads(read('server-final').splitlines()[-1]) == {
    'syntheticGreetingCalls': 1, 'unexpectedMessages': 0,
    'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-greet').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
parent = '07d3159e73bc8ee4620904260905b1b3ca251c20'
work = changed_sources(root)
work += ['js/src/automation/vk-message-random.js', 'js/tests/vk-message-random.test.js']
receipts = evidence_logs(root, 'vk-proactive')
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-proactive-reference-*.js')]
receipts += [f'ci-logs/vk-friends-schema-{n}.json' for n in ['methods', 'responses', 'objects']]
receipts += ['ci-logs/vk-cancelled-messages-objects.json',
             'ci-logs/vk-online-reference-index.js',
             'ci-logs/vk-online-reference-index-blob.json',
             'ci-logs/vk-greet-mcp-code.js',
             'ci-logs/vk-proactive-verified-app.min.js',
             'ci-logs/vk-proactive-production-review.diff',
             '.playwright-mcp/console-2026-11-15T09-46-56-006Z.log']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-greet.tar.gz', {
    'parent': parent, 'base_with_ci_corrections': 'ab453fda',
    'parent_failed_assertions': 1,
    'node_feature_checks': 15, 'deno_feature_checks': 15,
    'node_compatibility_checks': 13, 'deno_compatibility_checks': 13,
    'separate_node_capability_security_registry_checks': 9,
    'native_synthetic_greetings': 2,
    'compatibility_native_prompts': 2, 'compatibility_native_blocks': 1,
    'independent_mcp_languages': 4, 'synthetic_mcp_greetings': 1,
    'live_provider_effects': 0, 'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'issue_complete': False,
}, 'issue-56-vk-greet/*.png', before=parent_reply_sources(root, work, parent))
