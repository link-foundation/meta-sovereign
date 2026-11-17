"""Preserve finite weighted rewording regressions and actual browser evidence."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'question-weighted')
verify_evidence(read, {
    'parent': ['tests 10', 'pass 1', 'fail 9', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 45', 'pass 45', 'fail 0', 'cancelled 0', 'skipped 0'],
    'i18n': ['tests 25', 'pass 25', 'fail 0', 'cancelled 0', 'skipped 0'],
    'browser-before': ['"sends":0', 'OK (chromium)'],
    'browser-after': ['"requiresReview":true', '"methodSaved":true', '"sends":0', 'OK (chromium)'],
    'ci-browser': ['"methodSaved":true', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
response = json.loads((logs / 'question-weighted-mcp-result.json').read_text())
assert not response.get('isError')
result = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in result['results']] == ['en', 'ru']
assert all(item['method'] == 'weighted' and item['phoneFits'] for item in result['results'])
assert 'Review required' in result['results'][0]['text']
assert 'нужна проверка' in result['results'][1]['text']
assert not result['liveProvider']
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    resourcesClosed=True, sends=0, knowledgeUnchanged=True, liveProvider=False)
parent = '1b449fb54827614b32840fb54ecdef531f3eb1b0'
sources = changed_sources(root, parent)
existing = set(subprocess.check_output([
    'git', 'ls-tree', '-r', '--name-only', parent, '--', 'js/src'], cwd=root,
    text=True).splitlines())
before = {name: parent for name in sources if name in existing}
bundle(root, sources + evidence_logs(root, 'question-weighted') + [
    'ci-logs/qa02-reference-database.mjs', 'ci-logs/qa02-reference-pr123.json',
], 'docs/case-studies/issue-56/data/question-weighted.tar.gz', dict(
    parent=parent, parentChecks=10, parentFailures=9, focused=45, localeChecks=25,
    nativeScenarios=1, mcpLocales=2, authenticatedProviders=0,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True,
    issueComplete=False,
), 'issue-56-question-weighted/*.png', before=before)
