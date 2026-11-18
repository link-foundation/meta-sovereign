"""Verify bounded identity evidence and preserve actual parent source bytes."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'vk-identity')
verify_evidence(read, {
    'parent': ['the shared identity preset must exist', 'fail 2',
               'Restored all actual-parent identity comparison sources.'],
    'node': ['pass 56', 'fail 0'],
    'shared-tests': ['pass 22', 'fail 0'],
    'deno': ['9 passed | 0 failed'],
    'compatibility': ['pass 63', 'fail 0'],
    'before-browser': ['"identityAvailable":false', '"sends":0', 'OK (chromium)'],
    'native': ['"savedVariants":true', '"pageErrors":[]', '"sends":0', 'OK (chromium)'],
    'gratitude-browser': ['"savedTextRestored":true', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
inspection = json.loads((logs / 'vk-identity-mcp-result.json').read_text())
summary = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(item['translated'] and item['retainedVariants'] and item['privateReplies'] == 2
           for item in summary['result'])
assert summary['exceptions'] == [] and summary['liveProvider'] is False
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'sends': 0, 'liveProvider': False, 'resourcesClosed': True,
}
parent = '53a8479253b7a75b2f39cfa6d06ac816f6f7be93'
extra = ['ci-logs/vk-identity-mcp-code.js', 'ci-logs/vk-identity-verified-app.min.js']
extra += [str(path.relative_to(root)) for path in logs.glob('vk-identity-who-*.js')]
sources = changed_sources(root)
before = {name: parent for name in sources if name.startswith('js/src/') and
          name not in ['js/src/automation/identity.js', 'js/src/automation/personal-reply.js',
                       'js/src/crm/identity-question.js', 'js/src/crm/message-time.js']}
before['js/src/web/app.min.js'] = parent
bundle(root, sources + evidence_logs(root, 'vk-identity') + extra,
       'docs/case-studies/issue-56/data/vk-identity.tar.gz',
       dict(parent=parent, parent_failing=2, focused_node=9, combined_node=56,
            shared_reply_node=22, focused_deno=9, compatibility=63,
            pinned_reference_cases=6, native_identity_cases=1, native_gratitude_cases=1,
            independent_mcp_locales=4, mocked_vk_adapter_receipts=2,
            authenticated_provider_sessions=0, all_original_unchecked_requirements=78,
            issue_complete=False, hosted_checks_pending=True),
       'issue-56-vk-identity/*.png', before=before)
