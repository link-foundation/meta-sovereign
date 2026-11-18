"""Validate and preserve finite VK24 cache/export evidence."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

prefix = 'vk-cache'
parent = '35764037b1fba1fbbd613e46d366359a5c1f0959'
root, logs, read = evidence_context(__file__, prefix)
verify_evidence(read, {
    'before-node': ['fail 1', 'false !== true'],
    'before-ui': ['"missingCacheControls":true', '"providerReads":0'],
    'shutdown-before': ['fail 1', 'true !== false'],
    'node': ['pass 27', 'fail 0'],
    'deno': ['27 passed | 0 failed'],
    'native': ['"completeHistory":401', '"reloadWithoutProvider":true',
               '"unexpectedMessages":0', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
raw = json.loads((logs / f'{prefix}-mcp-result.json').read_text())
result = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result['errors'] == [] and result['liveProvider'] is False
assert [row['language'] for row in result['result']] == ['en', 'ru', 'hi', 'zh']
assert all(row['translated'] and row['partialCacheRetained'] and row['reloadInspection']
           and '200' in row['exportReceipt'] for row in result['result'])
manifests = json.loads((logs / f'{prefix}-mcp-manifests.json').read_text())
assert all(row['messages'] == 200 and row['coverage']['complete'] is False
           and row['coverage']['nextOffset'] == 200 for row in manifests.values())
for suffix in ['mcp-cached-fixture', 'mcp-fixture', 'mcp-final-fixture']:
    assert json.loads(read(suffix).splitlines()[-1]) == {
        'syntheticReads': 20, 'messages': 0,
        'liveProvider': False, 'resourcesClosed': True,
    }
assert 'ERR_CACHE_WRITE_FAILURE' in read('mcp-cached-console')
assert 'ERR_CACHE_WRITE_FAILURE' not in read('mcp-console')
assert 'Errors: 1' in read('mcp-console') and 'favicon.ico' in read('mcp-console')
shots = list((root / 'docs/screenshots/issue-56-vk-cache').glob('*.png'))
assert len(shots) == 10
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
sources = changed_sources(root)
receipts = evidence_logs(root, prefix, suffixes=('.log', '.json', '.js'))
bundle(root, sources + receipts, 'docs/case-studies/issue-56/data/vk-cache.tar.gz', {
    'parent': parent, 'node_passed': 27, 'deno_passed': 27,
    'new_checks': 15, 'native_history': 401, 'mcp_exported_per_language': 200,
    'live_provider_effects': 0, 'hosted_verification_pending': True,
    'issue_complete': False,
}, 'issue-56-vk-cache/*.png', before=parent_reply_sources(root, sources, parent))
