"""Preserve exact SARIF replay and reviewed source-bound audit refresh."""
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-codeql-hash')
assert 'js/redos at js/tests/server-hardening.test.js:520' in read('before')
assert '"auditedFalsePositives":2' in read('after')
assert 'pass 4' in read('focused') and 'fail 0' in read('focused')
sources = [
    '.github/codeql/audited-findings.json',
    'js/tests/server-hardening.test.js',
    'js/src/patterns/safe-regex.js',
    'js/scripts/check-codeql-results.mjs',
    'js/tests/ci-codeql-results.test.js',
    'docs/case-studies/issue-56/ci-codeql-audit-digest.md',
    'experiments/issue-56/collect-ci-codeql-digest.py',
    'ci-logs/security-44014091633.log',
    'ci-logs/security-44014091633.json',
] + evidence_logs(root, 'ci-codeql-hash')
sources += [str(p.relative_to(root)) for p in
            (logs / 'security-82ff-sarif').rglob('*.sarif')]
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-codeql-audit-digest.tar.gz',
       dict(parent='82ff7202', hostedRun=44014091633, focused=4,
            digestOnly=True, gateUnchanged=True, acceptance=False),
       'issue-56-ci-codeql-digest/*.png',
       before={'.github/codeql/audited-findings.json': '82ff7202'})
