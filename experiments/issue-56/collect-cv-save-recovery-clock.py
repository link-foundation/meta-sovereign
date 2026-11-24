"""Preserve the bounded CV Save navigation recovery regression and CI log."""
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-save-recovery-clock')
for name, fragments in {
    'before': ('jobs-cv-readback', 'fail 1'),
    'node': ('pass 17', 'fail 0'),
    'deno': ('6 passed | 0 failed',),
    'format-final': ('All matched files use Prettier code style!',),
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication')
parent = 'ec835b0b109846abcd2f615ba8507d0d79f6a69d'
sources = [
    'js/src/jobs/cv-save-cycle.js',
    'js/tests/cv-save-watch-recovery.test.js',
    'experiments/issue-56/cv-save-recovery-clock.mjs',
    'experiments/issue-56/cv-save-recovery-clock-before.py',
    'experiments/issue-56/collect-cv-save-recovery-clock.py',
    'experiments/issue-56/application_parent_fixture.py',
    'ci-logs/checks-43611833853-macos-node-3.log',
] + evidence_logs(root, 'cv-save-recovery-clock')
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-cv-save-recovery-clock.tar.gz',
       dict(published_parent=parent, run=43611833853, failed_job=132499772549,
            original_hosted_delay_measured=False, finite_probe_delay_ms=120,
            logical_verification_ms=100, node_passed=17, deno_passed=6,
            production_deadline_ms=30000, maximum_read_attempts=5,
            original_incomplete_rows=81, issue_complete=False,
            exact_head_ci_required=True),
       'no-cv-clock-screenshots-expected',
       before={'js/src/jobs/cv-save-cycle.js': parent})
