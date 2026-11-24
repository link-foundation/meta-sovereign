"""Preserve finite VK greeting catalog, destination and reference evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'vk-greeting-catalog')
verify_evidence(read, {
    'parent-final': ['pass 3', 'fail 6', 'Restored all actual-parent comparison sources.'],
    'tests-final': ['pass 9', 'fail 0'],
    'deno': ['9 passed | 0 failed'],
    'compatibility-final': ['pass 19', 'fail 0'],
    'before-browser-rerun': ['"catalogEditable":false', '"sends":0', 'OK (chromium)'],
    'browser-final': ['"catalogEditable":true', '"pageErrors":[]', '"sends":0', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
result = json.loads((logs / 'vk-greeting-catalog-mcp-result.json').read_text())
review = result['content'][0]['text'].split('### Result\n', 1)[1].split('\n###', 1)[0]
review = json.loads(review)
assert [row['locale'] for row in review['results']] == ['en', 'ru', 'hi', 'zh']
assert all(all(row[key] for key in ['translatedLabel', 'savedTextsRetained', 'privateRepliesOnly'])
           for row in review['results'])
assert not review['errors'] and not review['liveProvider']
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed == dict(sends=0, liveProvider=False, resourcesClosed=True)
reference = json.loads((root / 'experiments/issue-56/vk-greeting-reference-cases.json').read_text())
assert len(reference['numericStickerIds']) == 98 and len(reference['russianForms']) == 35
parent = '0a6283651778b914102c6ddb49a19d29cbf80070'
sources = changed_sources(root)
extra = ['ci-logs/' + name for name in [
    'vk-reference-greeting-blob.json', 'vk-reference-greeting.js', 'vk-reference-readme.md',
    'vk-greetings-pr36.json', 'vk-greetings-pr53.json', 'vk-greeting-catalog-reference-image.png',
    'vk-greeting-catalog-mcp-code.js', 'vk-greeting-catalog-verified-app.min.js',
]]
before = {name: parent for name in [
    'js/src/greetings/plan.js', 'js/src/greetings/index.js',
    'js/src/cli/greetings-commands.js', 'js/src/web/greetings-view.js',
    'js/src/web/app.min.js',
]}
bundle(root, sources + evidence_logs(root, 'vk-greeting-catalog') + extra,
       'docs/case-studies/issue-56/data/vk-greeting-catalog.tar.gz',
       dict(parent=parent, focused_node=9, focused_deno=9, parent_failing=6,
            compatibility=19, reference_stickers=98, reference_texts=35,
            native_cases=1, independent_mcp_locales=4, authenticated_provider_sessions=0,
            all_original_unchecked_requirements=79, hosted_checks_pending=True, issue_complete=False),
       'issue-56-vk-greeting-catalog/*.png', before=before)
