"""Verify bounded diagnostics evidence before archiving source and parent bytes."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    bundle, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'diagnostics')
verify_evidence(read, {
    'node': ['pass 55', 'fail 0', 'cancelled 0'],
    'deno': ['54 passed | 0 failed | 1 ignored'],
    'format-final': ['All matched files use Prettier code style!'],
    'before-node': ['fail 1', 'must redact private-fixture'],
})
assert json.loads(read('before-ui')) == {
    'missingDiagnostics': True, 'liveProvider': False,
}
native = json.loads(read('after-ui'))
assert all(native[key] for key in [
    'liveLogs', 'copyAcknowledged', 'copyRefusalVisible',
    'recoveryRetainsEntries', 'closedDoesNotPoll',
]) and native['pageErrors'] == 0 and native['liveProvider'] is False
inspection = json.loads((logs / 'diagnostics-mcp-result-final.json').read_text())
summary = json.loads(inspection['content'][0]['text'].split(
    '### Result\n')[1].split('\n###')[0])
assert {item['language'] for item in summary['result']} == {'en', 'ru', 'hi', 'zh'}
assert all(item['copiedVisibleRedactedLog'] and item['desktopAndPhoneFit']
           and item['collapsedViewDisposed'] for item in summary['result'])
assert summary['pageErrors'] == 0 and summary['liveProvider'] is False
assert all('404' in error for error in summary['consoleErrors'])
assert all(item['error'] == 'net::ERR_ABORTED' for item in summary['requestFailures'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'resourcesClosed': True, 'liveProvider': False,
}
sources = changed_sources(root)
parent = '77ac37e3e51746f6dd74afef4aec3fd5881c9030'
references = [str(p.relative_to(root)) for p in logs.glob('vk-desktop-reference-*')
              if p.is_file() and p.suffix in {'.json', '.source', '.png'}]
bundle(root, sources + evidence_logs(root, 'diagnostics', ('.log', '.json', '.js'))
       + references, 'docs/case-studies/issue-56/data/live-diagnostics.tar.gz', {
           'parent': parent, 'node_passed': 55, 'deno_passed': 54,
           'deno_ignored_node_only_import_graph': 1,
           'journal_entries': 300, 'journal_bytes': 262144,
           'line_characters': 4096, 'maximum_retry_ms': 30000,
           'mcp_expected_provider_404s': len(summary['consoleErrors']),
           'mcp_owned_teardown_aborts': len(summary['requestFailures']),
           'live_provider_effects': 0, 'hosted_verification_pending': True,
           'unchecked_inventory_rows': 55, 'issue_complete': False,
       }, 'issue-56-diagnostics/*.png',
       before=parent_reply_sources(root, sources, parent))
