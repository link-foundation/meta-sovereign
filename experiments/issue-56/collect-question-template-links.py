"""Preserve exact-parent link matching failures and finite native evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'question-template-links')
verify_evidence(read, {
    'before': ['pass 2', 'fail 4'],
    'node': ['pass 11', 'fail 0'],
    'deno': ['11 passed | 0 failed'],
    'compatibility': ['pass 34', 'fail 0'],
    'ci-registry': ['pass 1', 'fail 0'],
    'browser-before-framed': ['"newLinkRequiresReview":false', '"nativeSends":0', 'OK (chromium)'],
    'browser-framed': ['"newLinkRequiresReview":true', '"nativeSends":0', '"pageErrors":[]', 'OK (chromium)'],
    'browser-compatibility': ['"nativeReplies":1', '"newLinkRequiresReview":true', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
review = json.loads((logs / 'question-template-links-mcp-review.json').read_text())
assert 'Review required before automatic sending.' in review['text']
assert review['draft'] == 'Five years.' and not review['overflow']
assert not review['nativeSendAttempted'] and not review['liveProvider']
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed['resourcesClosed'] and closed['stats'] == dict(clicks=0, textSends=0, draft='')
bundle(root, changed_sources(root) + [name for name in evidence_logs(root, 'question-template-links')
                                    if 'parent-' not in name],
       'docs/case-studies/issue-56/data/question-template-links.tar.gz',
       dict(parent='f5e6232174f3f8ce85beff97ab11f59f1a11dd75',
            parent_failing_cases=4, focused_node=11, focused_deno=11,
            compatibility=34, ci_registry=1, provider_planners=5,
            link_guard_native_sends=0, independent_mcp_sends=0,
            authenticated_provider_sessions=0, issue_complete=False),
       'issue-56-template-link-guards/*.png',
       before={'js/src/automation/question-match.js': 'f5e62321'})
