"""Preserve finite birthday verification without claiming live delivery."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-birthday')
verify_evidence(read, {
    'before-node': ['fail 1', 'birthdaySnapshot', 'undefined'],
    'before-ui': ['"missingBirthdayControls":true', '"liveProvider":false'],
    'node-final': ['pass 34', 'fail 0'],
    'deno-final': ['34 passed | 0 failed'],
    'compatibility': ['pass 14', 'fail 0'],
    'native-final': ['"orderedBirthday":true', '"reviewedDate":true',
                     '"dayDeduplication":true', '"partialReceiptRetained":true',
                     '"pageErrors":0', '"liveProvider":false'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('lint-final', 'secrets', 'diff'))
raw = json.loads((logs / 'vk-birthday-mcp-result.json').read_text())
summary = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert [r['language'] for r in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(r[k] for k in ['translated', 'reviewedBirthday',
                             'dateDeduplication', 'automaticOff']) for r in summary['result'])
assert json.loads(read('mcp-server-final').splitlines()[-1]) == {
    'syntheticBirthdayCalls': 2, 'unexpectedMessages': 0,
    'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-birthday').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
for language in ['', '.ru', '.hi', '.zh']:
    assert 'vk-birthday' in (root / f'docs/VK-BIRTHDAY-GREETINGS{language}.md').read_text()
parent = '3badd29a5acbd49ba09f1425133f2efc0f1a001d'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-birthday', suffixes=('.log', '.json', '.js', '.png'))
receipts += ['ci-logs/vk-birthday-production-review.diff']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-birthday.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1,
    'new_feature_checks': 18, 'node_focused_checks': 34,
    'deno_focused_checks': 34, 'additional_compatibility_checks': 14,
    'guide_languages': 4, 'native_partial_recovery': True,
    'independent_mcp_languages': 4, 'synthetic_mcp_calls': 2,
    'live_provider_effects': 0, 'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'issue_complete': False,
}, 'issue-56-vk-birthday/*.png', before=parent_reply_sources(root, work, parent))
