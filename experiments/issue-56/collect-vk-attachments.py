"""Preserve bounded attachment collection checks and exact-parent sources."""
import json
import subprocess
from evidence_bundle import (bundle, changed_sources, evidence_context,
                             evidence_logs, parent_reply_sources, verify_evidence)

root, logs, read = evidence_context(__file__, 'vk-attachments')
verify_evidence(read, {
    'before-node': ['fail 1'],
    'parent': ['all sources restored.'],
    'node-final': ['pass 15', 'fail 0'],
    'deno-final': ['12 passed | 0 failed'],
    'compatibility': ['pass 33', 'fail 0'],
    'registry': ['pass 2', 'fail 0'],
    'before-ui': ['"missingCollection":true', '"providerEffects":0'],
    'native-final': ['"records":4', '"firstObservationRetained":true',
                     '"pausedRecordSkipped":true', '"refusalRetained":true',
                     '"providerEffects":0', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
inspection = json.loads((logs / 'vk-attachments-mcp-result.json').read_text())
result = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [entry['language'] for entry in result['result']] == ['en', 'ru', 'hi', 'zh']
assert all(entry['translated'] and entry['retainedRecords'] == 3
           and entry['savedChoiceRetained'] and entry['literalMetadata']
           for entry in result['result'])
assert result['errors'] == [] and result['liveProvider'] is False
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'providerEffects': 0, 'liveProvider': False, 'resourcesClosed': True,
}
images = list((root / 'docs/screenshots/issue-56-vk-attachments').glob('*.png'))
assert len(images) == 10
assert all(path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') for path in images)
parent = subprocess.check_output(['git', 'rev-parse', '2733ff54'], cwd=root).decode().strip()
sources = changed_sources(root)
extra = ['ci-logs/vk-attachments-verified-app.min.js',
         'ci-logs/vk-attachments-mcp-code.js', 'ci-logs/vk-attachments-reference.js']
bundle(root, sources + evidence_logs(root, 'vk-attachments') + extra,
       'docs/case-studies/issue-56/data/vk-attachments.tar.gz',
       dict(parent=parent, parent_failing=1, focused_node=15, focused_deno=12,
            compatibility_including_regressions=33, registry_checks=2,
            native_before_cases=1, native_after_cases=1, independent_mcp_locales=4,
            provider_effects=0, authenticated_provider_sessions=0,
            console_cache_write_diagnostics_retained=True,
            issue_complete=False, hosted_checks_pending=True),
       'issue-56-vk-attachments/*.png', before=parent_reply_sources(root, sources, parent))
