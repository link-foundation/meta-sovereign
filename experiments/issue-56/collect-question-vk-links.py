"""Preserve independent VK destination and native chronology regressions."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'question-vk-links')
verify_evidence(read, {
    'parent': ['tests 27', 'pass 2', 'fail 25',
               'restored every changed source file.'],
    'focused': ['tests 50', 'pass 50', 'fail 0', 'cancelled 0', 'skipped 0'],
    'compatibility': ['tests 36', 'pass 36', 'fail 0', 'cancelled 0'],
    'registration': ['tests 1', 'pass 1', 'fail 0'],
    'browser-before': ['"hiddenTargetVisible":false', '"requiresReview":false',
                       '"resourcesClosedOnExit":true', 'OK (chromium)'],
    'browser-after': ['"hiddenTargetVisible":true', '"requiresReview":true',
                      '"resourcesClosedOnExit":true', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
response = json.loads((logs / 'question-vk-links-mcp.json').read_text())
result = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [row['locale'] for row in result['results']] == ['en', 'ru', 'hi', 'zh']
assert all(row['literalDestination'] and row['translatedLabel'] for row in result['results'])
assert not result['errors'] and not result['followed']
assert not result['reloadReplayed'] and not result['liveProvider']
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    sends=0, liveProvider=False, resourcesClosed=True)
console = read('mcp-console')
assert '404 (Not Found)' in console and console.count('ERR_CACHE_WRITE_FAILURE') == 3
parent = '6d1dcc249d224f9ea8d46d1d98acd7fcc31ff957'
existing = set(subprocess.check_output([
    'git', 'ls-tree', '-r', '--name-only', parent, '--', 'js/src'], cwd=root,
    text=True).splitlines())
sources = changed_sources(root, parent)
before = {name: parent for name in sources if name in existing}
schema = [str(path.relative_to(root)) for path in logs.glob('vk-link-schema-*')
          if path.name.endswith(('.log', '.json'))]
bundle(root, sources + evidence_logs(root, 'question-vk-links') + schema + [
    'ci-logs/question-message-time-before.log',
    'ci-logs/6d1dcc24-links-pass.log', 'ci-logs/6d1dcc24-runs-followup.json',
], 'docs/case-studies/issue-56/data/question-vk-links.tar.gz', dict(
    parent=parent, parentChecks=27, parentFailures=25, focused=50,
    compatibility=36, browserRegistration=1, nativeScenarios=1,
    schemaHead='333481bd082ad747d4873ef4a77f9247097eeef0',
    authenticatedProviders=0, acceptedCriteria=83, unfinishedCriteria=35,
    hostedVerificationPending=True, issueComplete=False,
), 'issue-56-question-vk-links/*.png', before=before)
