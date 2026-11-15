"""Check finite acquaintance evidence and retain actual parent source bytes."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'vk-acquaintance')
verify_evidence(read, {
    'before-node': ['the shared acquaintance preset must exist', 'fail 1'],
    'parent': ['Restored the actual-parent acquaintance comparison sources.'],
    'catalog-node': ['pass 6', 'fail 0'],
    'catalog-deno': ['6 passed | 0 failed'],
    'catalog-compatibility': ['pass 28', 'fail 0'],
    'refactor-node': ['pass 2', 'fail 0'],
    'before-ui': ['"acquaintanceAvailable":false', '"sends":0', 'OK (webkit)'],
    'catalog-native': ['"savedVariants":true', '"pageErrors":[]', '"sends":0', 'OK (webkit)'],
    'catalog-identity-browser': ['"identityAvailable":true', '"pageErrors":[]', 'OK (webkit)'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('lint-final', 'secrets-final', 'diff'))
inspection = json.loads((logs / 'vk-acquaintance-final-mcp-result.json').read_text())
summary = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(item['translated'] and item['retainedVariants'] and item['privateReplies'] == 2
           and item['stableAlternatives'] for item in summary['result'])
assert summary['exceptions'] == [] and summary['liveProvider'] is False
assert json.loads(read('final-mcp-server').splitlines()[-1]) == {
    'sends': 0, 'liveProvider': False, 'resourcesClosed': True,
}
parent = 'e56d8854979e5ce73c4614dd197442bfe4a6a768'
extra = ['ci-logs/vk-acquaintance-mcp-code.js', 'ci-logs/vk-acquaintance-verified-app.min.js']
extra += [str(path.relative_to(root)) for path in logs.glob('vk-acquaintance-reference*.js')]
sources = changed_sources(root)
before = {}
for name in sources:
    if name.startswith('js/src/') and subprocess.run(
            ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        before[name] = parent
before['js/src/web/app.min.js'] = parent
bundle(root, sources + evidence_logs(root, 'vk-acquaintance') + extra,
       'docs/case-studies/issue-56/data/vk-acquaintance.tar.gz',
       dict(parent=parent, parent_failing=1, focused_node=6, focused_deno=6,
            compatibility=28, refactored_editor_node=2, pinned_reference_cases=2,
            native_acquaintance_cases=1, native_identity_cases=1,
            independent_mcp_locales=4, mocked_vk_adapter_receipts=2,
            authenticated_provider_sessions=0, all_original_unchecked_requirements=78,
            issue_complete=False, hosted_checks_pending=True),
       'issue-56-vk-acquaintance/*.png', before=before)
