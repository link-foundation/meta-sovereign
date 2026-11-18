"""Preserve bounded native destination regressions and actual parent evidence."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'question-hidden-links')
verify_evidence(read, {
    'before-node': ['pass 0', 'fail 10'],
    'node': ['pass 10', 'fail 0'],
    'deno': ['10 passed | 0 failed'],
    'compatibility': ['pass 42', 'fail 0'],
    'registry': ['pass 1', 'fail 0'],
    'before-browser': ['"cases":2', '"staleChoiceSent":true', 'OK (chromium)'],
    'after-browser': ['"cases":4', '"staleChoiceSent":false',
                      '"explicitFreshReplies":1', '"pageErrors":[]', 'OK (chromium)'],
    'assembled-draft-failure': ['pass 0', 'fail 1', 'undefined'],
    'format-check': ['All matched files use Prettier code style!'],
})
review = json.loads((logs / 'question-hidden-links-mcp-review.json').read_text())
assert review['locales'] == ['en', 'ru', 'hi', 'zh']
assert review['literalDestination'] == 'https://company.test/information'
assert not review['overflow'] and not review['pageErrors'] and not review['liveProvider']
assert review['positiveReceipt'] == '102' and review['reloadLocked']
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed['resourcesClosed'] and closed['stats'] == dict(clicks=1, textSends=0, draft='')
console = read('mcp-console')
assert '404 (Not Found)' in console and console.count('ERR_CACHE_WRITE_FAILURE') == 5
parent = '438f2bf4c223d6e5a13b2332a04b0a79317c7e68'
existing = set(subprocess.check_output([
    'git', 'ls-tree', '-r', '--name-only', parent, '--', 'js/src'], cwd=root,
    text=True).splitlines())
sources = changed_sources(root)
before = {name: parent for name in sources if name in existing
          and name.endswith('.js') and not name.endswith('.min.js')}
bundle(root, sources + evidence_logs(root, 'question-hidden-links') + [
           'docs/case-studies/issue-56/ci-question-link-changeset.md'],
       'docs/case-studies/issue-56/data/question-hidden-links.tar.gz',
       dict(parent=parent, parent_failing_cases=10, focused_node=10, focused_deno=10,
            compatibility=42, ci_registry=1, native_cases=4, native_fresh_replies=1,
            independent_mcp_replies=1, authenticated_provider_sessions=0,
            all_original_unchecked_requirements=81, hosted_checks_pending=True,
            issue_complete=False),
       'issue-56-question-hidden-links/*.png', before=before)
