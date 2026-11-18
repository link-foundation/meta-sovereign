"""Preserve saved-template integration and independent native reply evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'question-templates')
verify_evidence(read, {
    'node': ['pass 5', 'fail 0'],
    'deno': ['5 passed | 0 failed'],
    'compatibility': ['pass 13', 'fail 0'],
    'ci-registry': ['pass 1', 'fail 0'],
    'browser': ['"cases":2', '"pageErrors":[]', '"nativeReplies":1', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
review = json.loads((logs / 'question-templates-mcp-review.json').read_text())
assert 'Pattern match' in review['text'] and review['draft'] == 'Живу во Вьетнаме.'
receipt = json.loads((logs / 'question-templates-mcp-receipt.json').read_text())
assert receipt['sendDisabled'] and not receipt['overflow']
final = json.loads((logs / 'question-templates-mcp-final.json').read_text())
assert final['receipt'] and final['sendDisabled'] and not final['liveProvider']
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed['resourcesClosed'] and closed['stats'] == dict(clicks=0, textSends=1, draft='')
sources = changed_sources(root) + [name for name in evidence_logs(root, 'question-templates')
                                 if 'parent-' not in name]
bundle(root, sources, 'docs/case-studies/issue-56/data/question-templates.tar.gz',
       dict(parent='b3d4cf77ffe012ab7ae6e3b8de38799bbceaec41',
            focused_node=5, focused_deno=5, compatibility=13, ci_registry=1,
            mocked_providers=5, native_browser_cases=2,
            native_replies=1, independent_mcp_replies=1,
            authenticated_provider_sessions=0, issue_complete=False),
       'issue-56-question-templates/*.png')
