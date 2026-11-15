"""Verify original default catalogs, explicit draft reset and retained evidence."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'message-defaults')
verify_evidence(read, {
    'node': ['pass 4', 'fail 0'],
    'deno': ['4 passed | 0 failed'],
    'before-node': ['1 !== 10', 'fail 1'],
    'format-final': ['All matched files use Prettier code style!'],
})
assert 'SyntaxError' not in read('before-node')
before = json.loads(read('before-ui'))
after = json.loads(read('after-ui'))
assert all(row['missingReset'] is True for row in before['result'])
assert [row['name'] for row in after['result']] == ['wall', 'birthday']
assert all(all(row[key] is True for key in (
    'draftOnly', 'undoOwnerText', 'otherFieldsPreserved', 'refusedSaveRetained',
    'savedReloadRetained')) for row in after['result'])
assert after['pageErrors'] == 0 and after['providerWrites'] == 0
assert after['liveProvider'] is False
inspection = json.loads((logs / 'message-defaults-mcp-result.json').read_text())
mcp = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [row['language'] for row in mcp['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(row[key] is True for key in (
    'translated', 'undoOwnerText', 'noAutosave', 'savedReloadRetained',
    'desktopAndPhoneFit')) for row in mcp['result'])
assert mcp['pageErrors'] == 0 and mcp['liveProvider'] is False
assert all('404 (Not Found)' in value for value in mcp['consoleErrors'])
assert all(row['error'] == 'net::ERR_ABORTED' for row in mcp['requestFailures'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'resourcesClosed': True, 'providerWrites': 0, 'messages': 0, 'liveProvider': False,
}
assert len(list((root / 'docs/screenshots/issue-56-message-defaults').glob('*.png'))) == 32
parent = '8bb1595f2d80fb191eeeb5aaf8d6fae834b2592e'
sources = changed_sources(root)
bundle(root, sources + evidence_logs(root, 'message-defaults'),
       'docs/case-studies/issue-56/data/vk-message-defaults.tar.gz', {
           'parent': parent, 'node_passed': 4, 'deno_passed': 4,
           'invitation_defaults': 10, 'birthday_defaults': 10,
           'live_provider_effects': 0, 'inventory_rows': 118,
           'unchecked_inventory_rows': 60, 'hosted_verification_pending': True,
           'issue_complete': False,
       }, 'issue-56-message-defaults/*.png',
       before=parent_reply_sources(root, sources, parent))
