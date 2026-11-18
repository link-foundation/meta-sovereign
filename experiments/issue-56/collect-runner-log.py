"""Verify finite session, trigger and owned browser evidence before archiving."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'runner-log')
verify_evidence(read, {
    'node': ['pass 31', 'fail 0', 'cancelled 0'],
    'bun': ['8 pass', '0 fail'],
    'deno': ['8 passed | 0 failed'],
    'rolling': ['pass 1', 'fail 0', 'cancelled 0'],
    'before-node': ['ENOENT', 'fail 1'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
assert 'SyntaxError' not in read('before-node')
assert 'ERR_MODULE_NOT_FOUND' not in read('before-node')
assert json.loads(read('before-ui')) == {
    'missingSessionControls': True, 'liveProvider': False,
}
after = json.loads(read('after-ui'))
assert all(after[key] is True for key in (
    'acknowledgedPreference', 'retainedAfterReload', 'downloadedFullSession',
    'failedSaveRetainsDraft', 'reloadRecoversAcknowledgedPreference',
    'collapsedOwnerDisposed', 'desktopAndPhoneFit',
))
assert after['pageErrors'] == 0 and after['liveProvider'] is False
inspection = json.loads((logs / 'runner-log-mcp-result.json').read_text())
mcp = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [row['language'] for row in mcp['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(row[key] for key in (
    'translated', 'acknowledgedSave', 'acknowledgedReload',
    'desktopAndPhoneFit', 'collapsedOwnerDisposed',
)) for row in mcp['result'])
assert mcp['pageErrors'] == [] and mcp['unexpectedResponses'] == []
assert mcp['liveProvider'] is False
expected = mcp['expectedUnavailableProviderResponses']
assert len(expected) == len(mcp['consoleErrors']) == 24
assert all(row['status'] == 404 and '/api/telegram/' in row['url'] for row in expected)
assert all(row['error'] == 'net::ERR_ABORTED' and any(
    part in row['url'] for part in ('/api/events?', '/api/diagnostics/settings')
) for row in mcp['requestFailures'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'resourcesClosed': True, 'liveProvider': False,
}
assert len(list((root / 'docs/screenshots/issue-56-runner-log').glob('*.png'))) == 14
assert 'test: cancelled' in read('parent-pipeline')
assert 'e2e-browser: cancelled' in read('parent-pipeline')
assert 'BlobNotFound' in read('parent-job-132925832067-api')
assert 'The operation was canceled.' in read('current-macos-api')
parent = '3659e48941ef520bcc06298a15c05bbbf3a1b80b'
sources = changed_sources(root)
bundle(root, sources + evidence_logs(root, 'runner-log'),
       'docs/case-studies/issue-56/data/runner-log.tar.gz', {
           'parent_production': parent, 'node_passed': 31, 'bun_passed': 8,
           'deno_passed': 8, 'rolling_upgrade_cases': 1,
           'native_webkit_cases': 1, 'mcp_languages': 4,
           'expected_unavailable_provider_responses': 24,
           'live_provider_effects': 0, 'inventory_rows': 118,
           'unchecked_inventory_rows': 60, 'hosted_verification_pending': True,
           'issue_complete': False,
       }, 'issue-56-runner-log/*.png',
       before=parent_reply_sources(root, sources, parent))
