"""Preserve finite native vacancy planning and independently observed drafts."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'salary-browser-vacancy')
verify_evidence(read, {
    'before': ['fail 5', 'pass 2', 'skipped 0'],
    'focused-final': ['pass 60', 'fail 0', 'skipped 0'],
    'browser-before': ['From 450 000 ₽ net per month.', '"reads":0',
                       '"textSends":0', '"resourcesClosed":true'],
    'browser-final': ['From $6 000 net per month.', '"reads":1',
                      '"textSends":0', '"ownerDraftPreserved":true',
                      '"resourcesClosed":true', 'OK (chromium)'],
    'clarification-native-final': ['[salary-browser-context-guard]',
                                   '[salary-browser-vacancy]',
                                   '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('secrets', 'diff'))
assert ' error ' not in read('lint-final')
expected = 'From $6 000 net per month.'
for phase in ['before', 'after']:
    response = json.loads((logs / f'salary-browser-vacancy-mcp-{phase}.json').read_text())
    text = response['content'][0]['text']
    if phase == 'before':
        assert response['isError'] and '"choice":"RUB","source":"default"' in text
    else:
        receipt = json.loads(text.split('### Result\n')[1].split('\n###')[0])
        assert receipt == dict(text=expected, currency='USD', basis='net',
                               status='review', prefilled=True, draftExists=True)
    server = json.loads(read(f'mcp-{phase}-server').splitlines()[-1])
    assert server['resourcesClosed'] and not server['liveProvider']
    assert server['stats'] == dict(clicks=0, textSends=0,
                                   draft=expected if phase == 'after' else '')
    assert len(server['reads']) == int(phase == 'after')
    assert all(record['closed'] and record['slot'] == 'question-vacancy'
               and record['navigation'] == ['https://hh.ru/vacancy/123']
               for record in server['reads'])
sources = changed_sources(root)
bundle(root, [*sources, *evidence_logs(root, 'salary-browser-vacancy'),
              'ci-logs/salary-browser-vacancy-mcp-code.js',
              'ci-logs/salary-context-chat-reference.json',
              'ci-logs/salary-context-chat-reference.mjs'],
       'docs/case-studies/issue-56/data/salary-browser-vacancy.tar.gz', {
           'acceptance': False, 'parentFailures': 5, 'newHelperControls': 2,
           'focusedTests': 60, 'submissions': 0, 'vacancyReads': 1,
           'reference': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
           'pending': 'Exact-source hosted verification and all 40 original criteria',
       }, 'issue-56-salary-vacancy-*.png',
       before=parent_reply_sources(root, sources, '45bb2376'))
