"""Preserve the actual Windows failures and focused platform-aware correction."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'resume-permissions')
assert 'pass 4' in read('node')
assert not read('lint').strip()
sources = [
    'js/tests/job-resume-export-files.test.js',
    'experiments/issue-56/collect-resume-permissions.py',
    'docs/case-studies/issue-56/ci-resume-permissions.md',
    'ci-logs/resume-permissions-node.log',
    'ci-logs/resume-permissions-lint.log',
    'ci-logs/technology-preceding-checks-43171285138.log',
    'ci-logs/technology-preceding-checks-43171285138.json',
    'ci-logs/technology-cancelled-desktop-43171284982.log',
]
bundle(root, sources,
       'docs/case-studies/issue-56/data/ci-resume-permissions.tar.gz',
       dict(parent='72ec50bfaa76542366d9c4d0adf97e8164d3773f',
            hosted=dict(commit='9e2169f31b843d06b877601d1c882f64dd51288f',
                        run=43171285138, created='2026-11-12T06:53:24Z',
                        windows_jobs=[131026083475, 131026084802],
                        infrastructure_job=131026083365),
            local_tests=4, windows_acl_verified=False,
            unfinished='Exact-head Windows CI, profile navigation and all unchecked issue criteria'),
       'issue-56-resume-permissions/*.png')
