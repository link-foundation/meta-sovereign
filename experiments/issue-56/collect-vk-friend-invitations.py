"""Preserve source-audited media choice without accepting unfinished parity."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-friend-invitations')
verify_evidence(read, {
    'before-node': ['fail 1', 'actual: undefined', 'expected: false'],
    'before-ui': ['"missingRandomMedia":true', '"providerEffects":0'],
    'node': ['pass 23', 'fail 0'],
    'deno': ['23 passed | 0 failed'],
    'native': ['"frozenSingleMedia":true', '"partialWithoutRepost":true',
               '"syntheticCalls":4', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
for part in ['mcp', 'mcp-uncached']:
    raw = json.loads((logs / f'vk-friend-invitations-{part}-result.json').read_text())
    result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert result['errors'] == [] and result['liveProvider'] is False
    assert [row['language'] for row in result['result']] == ['en', 'ru', 'hi', 'zh']
    assert all(row['retainedSingleMedia'] and row['translated'] and row['deduplication']
               and row['automaticOff'] for row in result['result'])
    server = json.loads(read(f'{part}-server').splitlines()[-1])
    assert server == dict(syntheticWallCalls=2, unexpectedMessages=0,
                          liveProvider=False, resourcesClosed=True)
assert 'ERR_CACHE_WRITE_FAILURE' in read('mcp-console')
assert 'ERR_CACHE_WRITE_FAILURE' not in read('mcp-uncached-console')
assert 'favicon.ico' in read('mcp-uncached-console')
shots = list((root / 'docs/screenshots/issue-56-vk-friend-invitations').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
sources = changed_sources(root)
receipts = evidence_logs(root, 'vk-friend-invitations', suffixes=('.log', '.json', '.js'))
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-friend-invites-reference-*')]
bundle(root, sources + receipts,
       'docs/case-studies/issue-56/data/vk-friend-invitations.tar.gz', {
           'parent': '8f07700354319632caf29dac3ce7fba9a569fdb5',
           'node_passed': 23, 'deno_passed': 23, 'new_cases': 6,
           'native_effects': 4, 'mcp_effects_per_inspection': 2,
           'live_provider_effects': 0, 'hosted_verification_pending': True,
           'any_author_hold_pending': True, 'confirmed_absence_pending': True,
           'issue_complete': False,
       }, 'issue-56-vk-friend-invitations/*.png',
       before=parent_reply_sources(root, sources, '8f077003'))
