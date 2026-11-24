"""Preserve source-audited media choice without accepting unfinished parity."""
import json
import sys
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

parity = '--parity' in sys.argv
prefix = 'vk-wall-parity' if parity else 'vk-friend-invitations'
parent = '7fc97ee2c6c319e6e78f6190af258b692b37d45e' if parity else '8f07700354319632caf29dac3ce7fba9a569fdb5'
passed = 30 if parity else 23
root, logs, read = evidence_context(__file__, prefix)
verify_evidence(read, {
    'before-node': ['fail 1', *(['Incomplete VK wall invitation evidence'] if parity else ['actual: undefined', 'expected: false'])],
    'before-ui': ['"missingAnyAuthorControl":true' if parity else '"missingRandomMedia":true', '"providerEffects":0'],
    'node': [f'pass {passed}', 'fail 0'],
    'deno': [f'{passed} passed | 0 failed'],
    'native': (['"anyAuthorHold":true', '"confirmedAbsence":true', '"distinctDeletionReceipt":true', '"syntheticCalls":3'] if parity else ['"frozenSingleMedia":true', '"partialWithoutRepost":true', '"syntheticCalls":4']) + ['"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
for part in (['mcp'] if parity else ['mcp', 'mcp-uncached']):
    raw = json.loads((logs / f'{prefix}-{part}-result.json').read_text())
    result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert result['errors'] == [] and result['liveProvider'] is False
    assert [row['language'] for row in result['result']] == ['en', 'ru', 'hi', 'zh']
    flags = ['anyAuthorHold', 'retainedAfterReload', 'confirmedAbsence'] if parity else ['retainedSingleMedia', 'deduplication', 'automaticOff']
    assert all(row['translated'] and all(row[key] for key in flags) for row in result['result'])
    server = json.loads(read(f'{part}-server').splitlines()[-1])
    assert server == dict(syntheticWallCalls=3 if parity else 2, unexpectedMessages=0,
                          liveProvider=False, resourcesClosed=True)
if parity:
    console = read('mcp-console')
    assert 'Errors: 0' in console or ('Errors: 1' in console and 'favicon.ico' in console)
    assert 'ERR_CACHE_WRITE_FAILURE' not in console
    assert '"partialWithoutRepost":true' in read('original-native')
else:
    assert 'ERR_CACHE_WRITE_FAILURE' in read('mcp-console')
    assert 'ERR_CACHE_WRITE_FAILURE' not in read('mcp-uncached-console')
    assert 'favicon.ico' in read('mcp-uncached-console')
shots = list((root / f'docs/screenshots/issue-56-{prefix}').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
sources = changed_sources(root)
receipts = evidence_logs(root, prefix, suffixes=('.log', '.json', '.js'))
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-friend-invites-reference-*')]
bundle(root, sources + receipts,
       f'docs/case-studies/issue-56/data/{prefix}.tar.gz', {
           'parent': parent,
           'node_passed': passed, 'deno_passed': passed, 'new_cases': 7 if parity else 6,
           'native_effects': 3 if parity else 4, 'mcp_effects_per_inspection': 3 if parity else 2,
           'live_provider_effects': 0, 'hosted_verification_pending': True,
           'any_author_hold_pending': not parity, 'confirmed_absence_pending': not parity,
           'issue_complete': False,
       }, f'issue-56-{prefix}/*.png',
       before=parent_reply_sources(root, sources, parent))
