"""Check ordered-reply verification and preserve its exact bounded evidence."""
import hashlib
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence, verify_vk_reply_inspection, parent_reply_sources

root, logs, read = evidence_context(__file__, 'vk-engagement')
verify_evidence(read, {
    'before-node': ['fail 1', 'missing ordered engagement preset'],
    'parent': ['Restored all actual-parent ordered reply sources.'],
    'node-final': ['pass 28', 'fail 0'],
    'deno-final': ['18 passed | 0 failed'],
    'compatibility': ['pass 38', 'fail 0'],
    'registry': ['pass 2', 'fail 0'],
    'before-ui': ['"engagementAvailable":false', 'OK (webkit)'],
    'native-final': ['"engagementAvailable":true', '"partialResume":true',
                     '"sharedChatOperator":true', '"mockProviderCalls":3',
                     '"acknowledgedSteps":2', '"pageErrors":[]', 'OK (webkit)'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('secrets', 'diff'))
assert '0 errors, 2 warnings' in read('lint-final')
verify_vk_reply_inspection(logs, 'vk-engagement-mcp-result.json', 'vk-engagement-mcp-server.log')
images = list((root / 'docs/screenshots/issue-56-vk-engagement').glob('*.png'))
assert len(images) == 11
for path in images:
    assert path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
parent = subprocess.check_output(['git', 'rev-parse', 'd6841cad'], cwd=root).decode().strip()
sources = changed_sources(root)
extra = ['ci-logs/vk-engagement-verified-app.min.js', 'ci-logs/vk-engagement-mcp-code.js']
extra += [str(path.relative_to(root)) for path in logs.glob('vk-context-engage*') if path.is_file()]
bundle(root, sources + evidence_logs(root, 'vk-engagement') + extra,
       'docs/case-studies/issue-56/data/vk-engagement.tar.gz',
       dict(parent=parent, parent_failing=1, focused_node=28, focused_deno=18,
            compatibility=38, registry_checks=2, native_before_cases=1, native_after_cases=1,
            independent_mcp_locales=4, mock_api_partial_calls=3, acknowledged_steps=2,
            authenticated_provider_sessions=0, all_original_unchecked_requirements=78,
            all_screenshots={str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
                             for path in images},
            issue_complete=False, hosted_checks_pending=True),
       'issue-56-vk-engagement/*.png', before=parent_reply_sources(root, sources, parent))
