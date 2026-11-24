"""Preserve observed-card precedence without treating it as QA12 acceptance."""
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    parent_reply_sources, verify_salary_draft_mcp,
)

root, logs, read = evidence_context(__file__, 'salary-browser-vacancy-card')
verify_evidence(read, {
    'before': ['fail 5', 'pass 1', 'skipped 0'],
    'focused': ['pass 18', 'fail 0', 'skipped 0'],
    'browser-before': ['From $6 000 net per month.', '"reads":1',
                       '"textSends":0', '"resourcesClosed":true'],
    'browser-final': ['From 5 500 € net per month.', '"reads":0',
                      '"textSends":0', '"resourcesClosed":true'],
    'native-group': ['[salary-browser-context-guard]', '[salary-browser-vacancy]',
                     '[salary-browser-vacancy-card]', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
expected = 'From 5 500 € net per month.'
for phase in ['before', 'after']:
    server = verify_salary_draft_mcp(
        logs, 'salary-browser-vacancy-card', phase, expected,
        currency='EUR', basis='net',
        parent_fragment='"choice":"USD","source":"vacancy-pay"')
    assert len(server['reads']) == int(phase == 'before')
    assert all(record['closed'] for record in server['reads'])
sources = changed_sources(root)
bundle(root, [*sources, *evidence_logs(root, 'salary-browser-vacancy-card'),
              'ci-logs/salary-browser-vacancy-card-mcp-code.js',
              'ci-logs/salary-context-chat-reference.json',
              'ci-logs/salary-context-chat-reference.mjs'],
       'docs/case-studies/issue-56/data/salary-browser-vacancy-card.tar.gz', {
           'acceptance': False, 'parentFailures': 5, 'parentControls': 1,
           'focusedTests': 18, 'submissions': 0, 'cardPageReads': 0,
           'reference': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
           'pending': 'Exact-source hosted verification and all 40 original criteria',
       }, 'issue-56-salary-vacancy-card-*.png',
       before=parent_reply_sources(root, sources, '40b4caaa'))
