"""Preserve the finite shared runner precedence and command override evidence."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'runner-configuration')
verify_evidence(read, {
    'parent': ['tests 13', 'pass 3', 'fail 10', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 31', 'pass 31', 'fail 0', 'cancelled 0', 'skipped 0'],
    'controller-final': ['fail 0', 'cancelled 0', 'skipped 0'],
    'browser-before': ['"localIgnored":true', '"noProcessMutation":true', 'OK (chromium)'],
    'browser-after': ['"revisionConflictRetainsDraft":true', '"explicitReload":true',
                      '"persistedProfile":true', '"noProcessMutation":true', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
result = json.loads(read('mcp-result').split('### Result\n')[1])
assert [item['language'] for item in result['result']] == ['en', 'ru', 'zh', 'hi']
assert all(item['translated'] and item['profileAcknowledged'] and item['desktopAndPhoneFit']
           for item in result['result'])
assert result['saves'] == 4 and result['pageErrors'] == 0 and result['localPrecedence']
assert not result['liveProvider']
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    resourcesClosed=True, liveProvider=False, globalUnchanged=True, mutations=[], healthReads=0)
console = read('mcp-console')
assert '404 (Not Found)' in console and 'ERR_CACHE_WRITE_FAILURE' in console
parent = '0d6cec93828c404a9cb7d15e7ed313a61d2214fa'
sources = changed_sources(root, parent)
existing = set(subprocess.check_output([
    'git', 'ls-tree', '-r', '--name-only', parent, '--', 'js/src'], cwd=root,
    text=True).splitlines())
before = {name: parent for name in sources if name in existing}
bundle(root, sources + evidence_logs(root, 'runner-configuration') + [
    'ci-logs/runner-configuration-mcp-code.js',
    'ci-logs/vd07-reference-requirements.md', 'ci-logs/vd07-reference-config.js',
    'ci-logs/0d6cec93-runs-runner-mcp.json', 'ci-logs/0d6cec93-main-runner-review.json',
], 'docs/case-studies/issue-56/data/runner-configuration.tar.gz', dict(
    parent=parent, parentChecks=13, parentFailures=10, focused=31,
    nativeScenarios=1, mcpLocales=4, authenticatedProviders=0,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True,
    issueComplete=False,
), 'issue-56-runner-configuration/*.png', before=before)
