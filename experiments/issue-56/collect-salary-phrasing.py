"""Preserve finite salary clarification regressions and native draft receipts."""
from evidence_bundle import evidence_context, verify_evidence, changed_sources, evidence_logs, bundle, verify_salary_draft_mcp

root, logs, read = evidence_context(__file__, 'salary-phrasing')
verify_evidence(read, {
    'before': ['fail 4', 'pass 5', 'skipped 0'],
    'focused': ['pass 23', 'fail 0', 'skipped 0'],
    'browser-before': ['"phase":"failed"'],
    'browser-final': ['[salary-clarification-phrasing]', '"currency":"USD"',
                      '"basis":"gross"', '"ownerDraftPreserved":true',
                      '"rulesPreserved":true', '"textSends":0',
                      '[e2e-salary-phrasing] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
expected = 'From $7 100 gross per month.'
for phase in ['before', 'after']:
    verify_salary_draft_mcp(logs, 'salary-phrasing', phase, expected)

bundle(root, [*changed_sources(root), *evidence_logs(root, 'salary-phrasing'),
              'ci-logs/salary-phrasing-mcp-code.js',
              'ci-logs/salary-vocabulary-reference-source.mjs',
              'ci-logs/checks-release-44061001426-lint.log'],
       'docs/case-studies/issue-56/data/salary-phrasing.tar.gz', {
           'acceptance': False, 'parentFailures': 4, 'passingParentControls': 5,
           'focusedTests': 23, 'nativeDraftReceipts': 1, 'mcpDraftReceipts': 1,
           'submissions': 0, 'pending': 'Exact-source hosted checks and all 40 original criteria',
       }, 'issue-56-salary-phrasing-*.png', before={
           'js/src/automation/salary-question.js': '6edc5698',
           'js/src/web/app.min.js': '6edc5698',
       })
