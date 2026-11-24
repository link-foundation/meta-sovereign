"""Require checked VK online outcomes, compatibility and drained evidence."""
import json
import subprocess
from evidence_bundle import (bundle, changed_sources, evidence_context,
                             evidence_logs, parent_reply_sources, verify_evidence)

root, logs, read = evidence_context(__file__, 'vk-online')
verify_evidence(read, {
    'before-node': ['fail 1'],
    'parent': ['all sources restored.'],
    'node-final': ['pass 31', 'fail 0'],
    'deno-final': ['26 passed | 0 failed'],
    'registry': ['pass 2', 'fail 0'],
    'before-ui': ['"missingOnlineControls":true', '"providerCalls":0'],
    'native-final': ['"confirmed":true', '"refused":true', '"unknownRetained":true',
                     '"failedSaveRetained":true', '"mockedProviderCalls":3',
                     '"messages":0', '"pageErrors":0'],
    'attachments-native': ['"records":4', '"refusalRetained":true',
                           '"providerEffects":0', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
for suffix, fields, expected in [
        ('mcp-result-final', ['acknowledged', 'savedChoiceRetained'],
         dict(mockedProviderCalls=4, messages=0, liveProvider=False, resourcesClosed=True)),
        ('attachments-mcp-result', ['retainedRecords', 'savedChoiceRetained', 'literalMetadata'],
         dict(providerEffects=0, liveProvider=False, resourcesClosed=True))]:
    inspection = json.loads((logs / f'vk-online-{suffix}.json').read_text())
    result = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert [item['language'] for item in result['result']] == ['en', 'ru', 'hi', 'zh']
    assert all(item['translated'] and all(item[field] for field in fields)
               for item in result['result'])
    assert result['errors'] == [] and result['liveProvider'] is False
    server = 'mcp-server-final' if suffix == 'mcp-result-final' else 'attachments-mcp-server'
    assert json.loads(read(server).splitlines()[-1]) == expected

images = list((root / 'docs/screenshots/issue-56-vk-online').glob('*.png'))
assert len(images) == 20 and all(image.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') for image in images)
parent = subprocess.check_output(['git', 'rev-parse', '9e934842'], cwd=root).decode().strip()
sources = changed_sources(root)
extras = ['ci-logs/vk-online-verified-app.min.js', 'ci-logs/vk-online-mcp-code.js',
          'ci-logs/vk-online-reference.js', 'ci-logs/vk-online-reference-index.js',
          'ci-logs/vk-online-schema-revision.txt']
bundle(root, sources + evidence_logs(root, 'vk-online') + extras,
       'docs/case-studies/issue-56/data/vk-online.tar.gz',
       dict(parent=parent, parent_failing=1, focused_node=31, focused_deno=26,
            registry_checks=2, native_before_cases=1, native_after_cases=1,
            attachment_native_compatibility=1, independent_mcp_locales=4,
            attachment_mcp_compatibility_locales=4, live_provider_effects=0,
            authenticated_provider_sessions=0, draft_csp_failure_corrected=True,
            issue_complete=False, hosted_checks_pending=True),
       'issue-56-vk-online/*.png', before=parent_reply_sources(root, sources, parent))
