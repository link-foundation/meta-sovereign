"""Preserve incoming salary context without claiming complete QA12 acceptance."""
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    parent_reply_sources, verify_salary_draft_mcp,
)

root, logs, read = evidence_context(__file__, 'salary-employer-context')
verify_evidence(read, {
    'before': ['fail 8', 'pass 1', 'skipped 0'],
    'focused': ['pass 42', 'fail 0', 'skipped 0'],
    'browser-before': ['From $6 000 net per month.', '"currency":"USD"', '"textSends":0'],
    'browser-final': ['From 5 500 € net per month.', '"currency":"EUR"', '"textSends":0'],
    'native-group': ['[salary-browser-context-guard]', '[salary-browser-vacancy-card]',
                     '[salary-employer-context]', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
for phase in ['before', 'after']:
    verify_salary_draft_mcp(logs, 'salary-employer-context', phase,
                           'From 5 500 € net per month.', currency='EUR', basis='net',
                           parent_fragment='"choice":"USD","source":"conversation"')
sources = changed_sources(root)
bundle(root, [*sources, *evidence_logs(root, 'salary-employer-context'),
              'ci-logs/salary-employer-context-mcp-code.js',
              'ci-logs/salary-context-chat-reference.json',
              'ci-logs/salary-context-chat-reference.mjs'],
       'docs/case-studies/issue-56/data/salary-employer-context.tar.gz', {
           'acceptance': False, 'parentFailures': 8, 'parentControls': 1,
           'focusedTests': 42, 'submissions': 0,
           'reference': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
           'pending': 'Full QA12 mapping, current hosted verification and all 40 original criteria',
       }, 'issue-56-salary-employer-context-*.png',
       before=parent_reply_sources(root, sources, '027b8575'))
