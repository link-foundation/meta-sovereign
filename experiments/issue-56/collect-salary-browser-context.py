"""Keep bounded native-history regressions and independent no-send receipts."""
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    verify_salary_draft_mcp, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'salary-browser-context')
verify_evidence(read, {
    'before-final': ['fail 3', 'pass 2', 'skipped 0'],
    'focused-final': ['pass 56', 'fail 0', 'skipped 0'],
    'browser-before-final': ['"phase":"failed"', "+ ''"],
    'guard-before': ['actual: 200', "operator: 'notStrictEqual'"],
    'browser-final': ['[salary-browser-context]', '"textSends":0',
                      '"ownerDraftPreserved":true', '"rulesPreserved":true',
                      '[salary-browser-context-guard]', '"refused":true',
                      '[e2e-salary-browser-context] OK (chromium)'],
    'clarification-native': ['[salary-clarification]', '[salary-clarification-phrasing]',
                             '[salary-clarification-numbers]', '[salary-browser-context]',
                             '[salary-browser-context-guard]',
                             '[e2e-question-controls] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('secrets', 'diff'))
assert '0 errors' in read('lint-final') and ' error ' not in read('lint-final')
for phase in ['before', 'after']:
    verify_salary_draft_mcp(logs, 'salary-browser-context', phase,
                            'From $7 100 gross per month.')
sources = changed_sources(root)
bundle(root, [*sources, *evidence_logs(root, 'salary-browser-context'),
              'ci-logs/salary-browser-context-mcp-code.js'],
       'docs/case-studies/issue-56/data/salary-browser-context.tar.gz', {
           'acceptance': False, 'parentFailures': 3, 'passingParentControls': 2,
           'focusedTests': 56, 'nativeContextGuard': True,
           'mcpDraftReceipts': 1, 'submissions': 0,
           'pending': 'Exact-source hosted verification and all 40 original criteria',
       }, 'issue-56-salary-browser-context-*.png',
       before=parent_reply_sources(root, sources, '19cedfee'))
