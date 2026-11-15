"""Verify the bounded gratitude evidence and preserve the actual parent bytes."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'vk-gratitude')
verify_evidence(read, {
    'parent': ['the shared gratitude preset must exist', 'fail 1', 'Restored all actual-parent comparison sources.'],
    'node': ['pass 13', 'fail 0'],
    'deno': ['13 passed | 0 failed'],
    'compatibility': ['pass 63', 'fail 0'],
    'before-browser': ['"gratitudeAvailable":false', '"sends":0', 'OK (chromium)'],
    'native': ['"savedTextRestored":true', '"pageErrors":[]', '"sends":0', 'OK (chromium)'],
    'greeting-browser': ['"catalogEditable":true', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
inspection = json.loads((logs / 'vk-gratitude-mcp-result.json').read_text())
summary = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['locale'] for item in summary['results']] == ['en', 'ru', 'hi', 'zh']
assert all(item['translatedLabels'] and item['savedChoicesRetained'] and item['privateRepliesOnly']
           for item in summary['results'])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'sends': 0, 'liveProvider': False, 'resourcesClosed': True,
}
assert len(json.loads((root / 'experiments/issue-56/vk-gratitude-reference-cases.json').read_text())) == 84
parent = '727e361a8c318a39bc8e23941a5bc41a80445f13'
extra = ['ci-logs/vk-gratitude-mcp-code.js', 'ci-logs/vk-gratitude-verified-app.min.js']
extra += [f'ci-logs/vk-gratitude-{name}.js' for name in ['reference', 'stickers', 'reference-tests']]
extra += evidence_logs(root, 'ci-question-link-locator-parent')
assert 'strict mode violation' in (logs / 'ci-question-link-locator-parent-browser-e2e-webkit-shard-2-4-132657458862.log').read_text()
bundle(root, changed_sources(root) + evidence_logs(root, 'vk-gratitude') + extra,
       'docs/case-studies/issue-56/data/vk-gratitude.tar.gz',
       dict(parent=parent, parent_failing=1, focused_node=13, focused_deno=13,
            compatibility=63, reference_phrase_cases=84, reference_sticker_ids=38,
            native_gratitude_cases=1, native_greeting_cases=1, independent_mcp_locales=4,
            mocked_vk_adapter_receipts=2, authenticated_provider_sessions=0,
            all_original_unchecked_requirements=79, issue_complete=False,
            hosted_checks_pending=True), 'issue-56-vk-gratitude/*.png',
       before={name: parent for name in [
           'js/src/automation/automations.js', 'js/src/automation/deliver.js',
           'js/src/automation/drafts.js', 'js/src/crm/reengage.js',
           'js/src/sources/browser-sender.js', 'js/src/web/app.min.js',
       ]})
