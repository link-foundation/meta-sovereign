"""Preserve actual CodeQL fixture findings and focused native verification."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context
root, logs, read = evidence_context(__file__, 'application-url')
assert 'OK (chromium)' in read('native')
assert read('native').count('"phase":"passed"') == 2
assert 'four misleading candidates' in read('regression')
assert not read('lint').strip() and not read('diff').strip()
assert 'All matched files' in read('prettier')
findings = json.loads((logs / 'application-url-findings.json').read_text())
assert sum(r['ruleId'] == 'js/incomplete-url-substring-sanitization'
           and not r.get('suppressions') for r in findings) == 2
bundle(root, changed_sources(root) + [
    'ci-logs/application-codeql-job.log', 'ci-logs/application-url-findings.json',
    *[str(p.relative_to(root)) for p in logs.glob('application-url-*')
      if p.suffix in ('.log', '.json') and not p.name.endswith(('-archive.log', '-commit.log', '-push.log'))]],
    'docs/case-studies/issue-56/data/ci-application-page-url.tar.gz',
    dict(parent='5a687049', findings=2, native_browser='chromium', scenarios=2,
         exact_head_codeql_pending=True, issue_complete=False),
    'no-application-url-images-*',
    before={'js/tests/helpers/e2e-job-application.mjs':'5a687049'})
