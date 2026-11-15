"""Validate and preserve focused VK25 catalog pipeline evidence."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

prefix = 'vk-stickers'
parent = '8c3049337025d4286db77ae3a9690c0a95892589'
root, logs, read = evidence_context(__file__, prefix)
verify_evidence(read, {
    'before-node': ['fail 1', 'false !== true'],
    'before-ui': ['"missingCatalogControls":true', '"providerReads":0'],
    'shutdown-before': ['fail 1', 'true !== false'],
    'node': ['pass 29', 'fail 0'],
    'deno': ['29 passed | 0 failed'],
    'native': ['"usableStickers":103', '"usableGreetingIds":2',
               '"reloadWithoutProvider":true', '"collectionChoiceRetained":true',
               '"unexpectedMessages":0', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
raw = json.loads((logs / f'{prefix}-mcp-result.json').read_text())
result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result['errors'] == [] and result['liveProvider'] is False
assert [row['language'] for row in result['result']] == ['en', 'ru', 'hi', 'zh']
assert all(row['translated'] and row['receivedFiltering'] and row['reloadInspection']
           and row['usableGreetingIds'] == 2 and row['receipt']
           for row in result['result'])
assert json.loads(read('mcp-fixture').splitlines()[-1]) == {
    'syntheticReads': 36, 'messages': 0, 'liveProvider': False,
    'resourcesClosed': True,
}
assert 'Errors: 0' in read('mcp-console')
manifests = json.loads((logs / f'{prefix}-mcp-manifests.json').read_text())
assert len(manifests) == 4
assert all(row['artworkDownloaded'] is False and row['accountId'] == 1
           and len(row['files']) == 7 for row in manifests.values())
shots = list((root / 'docs/screenshots/issue-56-vk-stickers').glob('*.png'))
assert len(shots) == 10
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
sources = sorted(set(changed_sources(root) + [
    'js/tests/vk-cache.test.js',
    'docs/case-studies/issue-56/vk-cache-security-follow-up.md',
]))
bundle(root, sources + evidence_logs(root, prefix, suffixes=('.log', '.json', '.js')),
       'docs/case-studies/issue-56/data/vk-stickers.tar.gz', {
           'parent': parent, 'node_passed': 29, 'deno_passed': 29,
           'new_checks': 14, 'native_usable_stickers': 103,
           'usable_greeting_ids': 2, 'bounded_export_usable_stickers': 1996,
           'live_provider_effects': 0, 'hosted_verification_pending': True,
           'issue_complete': False,
       }, 'issue-56-vk-stickers/*.png',
       before=parent_reply_sources(root, sources, parent))
