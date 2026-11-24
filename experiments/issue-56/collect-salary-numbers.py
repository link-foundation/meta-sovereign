"""Preserve finite named salary clarification regressions and native readback."""
from evidence_bundle import evidence_context, verify_evidence, changed_sources, evidence_logs, bundle, verify_salary_draft_mcp

root, logs, read = evidence_context(__file__, 'salary-numbers')
verify_evidence(read, {
    'before': ['fail 3', 'pass 9', 'skipped 0'],
    'focused': ['pass 26', 'fail 0', 'skipped 0'],
    'browser-before': ['"phase":"failed"', "+ ''"],
    'browser-final': ['[salary-clarification-numbers]', '"currency":"USD"',
                      '"basis":"gross"', '"ownerDraftPreserved":true',
                      '"rulesPreserved":true', '"textSends":0',
                      '[e2e-salary-numbers] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
for phase in ['before', 'after']:
    verify_salary_draft_mcp(logs, 'salary-numbers', phase, 'From $7 100 gross per month.')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'salary-numbers'),
              'ci-logs/salary-numbers-mcp-code.js',
              'ci-logs/salary-context-phrasing-probe-before.log',
              'ci-logs/salary-vocabulary-reference-source.mjs'],
       'docs/case-studies/issue-56/data/salary-numbers.tar.gz', {
           'acceptance': False, 'parentFailures': 3, 'passingParentControls': 9,
           'focusedTests': 26, 'nativeDraftReceipts': 1, 'mcpDraftReceipts': 1,
           'submissions': 0, 'pending': 'Fresh hosted checks and all 40 original criteria',
       }, 'issue-56-salary-numbers-*.png', before={
           'js/src/automation/salary-question.js': '2ece94b4',
           'js/src/web/app.min.js': '2ece94b4',
       })
