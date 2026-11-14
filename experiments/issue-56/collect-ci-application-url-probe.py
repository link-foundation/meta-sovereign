"""Retain the actual post-correction CodeQL regression in its negative probe."""
import json
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'application-url-current')
assert '1 unresolved findings' in read('codeql')
assert 'application-fixture-page-url.mjs:12' in read('codeql')
assert 'four misleading candidates' in read('probe')
assert not read('lint').strip()
findings = json.loads((logs / 'application-url-current-findings.json').read_text())
assert sum(row['ruleId'] == 'js/incomplete-url-substring-sanitization'
           for row in findings) == 1
names = [
    'experiments/issue-56/application-fixture-page-url.mjs',
    'experiments/issue-56/collect-ci-application-url-probe.py',
    'ci-logs/application-url-current-codeql.log',
    'ci-logs/application-url-current-findings.json',
    'ci-logs/application-url-current-artifacts.json',
    'ci-logs/application-url-current-probe.log',
    'ci-logs/application-url-current-lint.log',
]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/ci-application-url-probe.tar.gz',
                     names, dict(parent='20d47bb1940257485a3e5b0281d615fb6cc9f353',
                                 job=132268444304, gate_lines=[8890,8891,8892],
                                 misleading_candidates=4, issue_complete=False), len(names))
