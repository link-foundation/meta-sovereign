"""Check bounded contextual-reply evidence before preserving exact source bytes."""
import hashlib
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence, verify_vk_reply_inspection, parent_reply_sources

root, logs, read = evidence_context(__file__, 'vk-contextual')
verify_evidence(read, {
    'before-node': ['fail 4', 'missing contextual preset'],
    'parent-browser': ['Restored all actual-parent contextual reply sources.'],
    'node': ['pass 10', 'fail 0'],
    'deno': ['10 passed | 0 failed'],
    'compatibility-final': ['pass 34', 'fail 0'],
    'node-refactor': ['pass 44', 'fail 0'],
    'deno-refactor': ['10 passed | 0 failed'],
    'api-helper-node': ['pass 1', 'fail 0'],
    'registry': ['pass 2', 'fail 0'],
    'before-ui': ['"first-exchangeAvailable":false', '"clarificationAvailable":false', 'OK (webkit)'],
    'native-final': ['"first-exchangeAvailable":true', '"clarificationAvailable":true', 'OK (webkit)'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('lint-final', 'secrets-final', 'diff'))
kinds = ['first-exchange', 'wellbeing', 'purpose', 'clarification']
screenshots = {}
for kind in kinds:
    assert f'"{kind}Available":true' in read('native-final')
    assert f'"{kind}Available":false' in read('before-ui')
    verify_vk_reply_inspection(logs, f'vk-contextual-{kind}-mcp-result.json',
                               f'vk-contextual-{kind}-mcp-server.log')
    images = list((root / f'docs/screenshots/issue-56-vk-{kind}').glob('*.png'))
    assert len(images) == 5
    for path in images:
        assert path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
        screenshots[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
parent = subprocess.check_output(['git', 'rev-parse', 'c930cf39'], cwd=root).decode().strip()
sources = changed_sources(root)
before = parent_reply_sources(root, sources, parent)
extra = ['ci-logs/vk-contextual-verified-app.min.js']
extra += [f'ci-logs/vk-{kind}-mcp-code.js' for kind in kinds]
extra += [str(path.relative_to(root)) for path in logs.glob('vk-context-*.js')]
extra += [str(path.relative_to(root)) for path in logs.glob('vk-context-*-blob.json')]
bundle(root, sources + evidence_logs(root, 'vk-contextual') + extra,
       'docs/case-studies/issue-56/data/vk-contextual.tar.gz',
       dict(parent=parent, parent_failing=4, focused_node=10, focused_deno=10,
            compatibility=34, registry_checks=2, native_before_cases=4, native_after_cases=4,
            independent_mcp_cases=4, independent_mcp_locales_per_case=4,
            mocked_vk_adapter_receipts=8, all_screenshots=screenshots,
            authenticated_provider_sessions=0, all_original_unchecked_requirements=78,
            issue_complete=False, hosted_checks_pending=True),
       'issue-56-vk-first-exchange/*.png', before=before)
