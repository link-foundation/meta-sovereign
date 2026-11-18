"""Bind stale-receipt reproduction and corrected controller observations."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'runner-exclusive-receipt')
verify_evidence(read, {
    'before': ['tests 6', 'pass 0', 'fail 6'],
    'focused': ['tests 46', 'pass 46', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('lint', 'secrets', 'diff'))
names = evidence_logs(root, 'runner-exclusive-receipt') + [
    'js/src/server/runner-control.js', 'js/tests/runner-exclusive-receipt.test.js',
    'js/tests/runner-control.test.js', 'js/tests/runner-stop-drain.test.js',
    'js/tests/runner-screen.test.js', 'js/tests/runner-docker.test.js',
    'js/tests/runner-controller.test.js', 'js/tests/runner-inspection.test.js',
    'experiments/issue-56/runner-fixture.mjs',
    'experiments/issue-56/runner-exclusive-receipt-before.py',
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/collect-runner-exclusive-receipt.py',
    'docs/DESKTOP-RUNNER.md',
    'docs/case-studies/issue-56/runner-exclusive-receipt.md',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = '43e91c4f2fd9d9c0b76685878b44fe1fe1045bdb'
entries['before/js/src/server/runner-control.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/server/runner-control.js'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, parentFailures=6,
    focusedPasses=46, hostedPending=True, localDaemon=False,
    acceptedCriteria=86, unfinishedCriteria=32, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-exclusive-receipt.tar.gz', entries)
