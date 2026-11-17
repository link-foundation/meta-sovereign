"""Preserve the direct weighted input-boundary regression and finite checks."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'question-weighted-limits')
verify_evidence(read, {
    'before-node': ['tests 2', 'pass 1', 'fail 1', '0.3003332777870355'],
    'focused': ['tests 12', 'pass 12', 'fail 0', 'cancelled 0', 'skipped 0'],
    'build': ['Done in'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
parent = 'e574976e926a878d0b2754241417326f0f343a42'
sources = [
    'js/src/automation/question-match.js', 'js/src/automation/question-weighted.js',
    'js/src/web/app.min.js', 'js/tests/question-weighted-limits.test.js',
    'js/tests/question-weighted.test.js',
    'experiments/issue-56/question-weighted-limits-parent.py',
    'experiments/issue-56/parent_source_probe.py',
    'experiments/issue-56/collect-question-weighted-limits.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/question-weighted.md',
    *evidence_logs(root, 'question-weighted-limits'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
entries['before/js/src/automation/question-match.js'] = subprocess.check_output([
    'git', 'show', f'{parent}:js/src/automation/question-match.js'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, parentChecks=2, parentFailures=1, parentPositiveControls=1,
    focused=12, acceptedCriteria=83, unfinishedCriteria=35,
    hostedVerificationPending=True, issueComplete=False,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/question-weighted-limits.tar.gz', entries)
