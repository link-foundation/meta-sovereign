"""Preserve finite autopilot empty/edited-cap lifecycle regressions."""
import hashlib
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'autopilot-cap-lifecycle')
verify_evidence(read, {
    'before': ['tests 4', 'fail 2', 'pass 2', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 72', 'pass 72', 'fail 0', 'cancelled 0', 'skipped 0'],
    'build': ['Done in'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('lint', 'secrets', 'diff'))
sources = [
    'js/src/automation/autopilot.js', 'js/src/automation/runner.js',
    'js/src/automation/deliver.js', 'js/src/automation/outbox.js',
    'js/tests/autopilot-cap-lifecycle.test.js',
    'js/tests/automatic-cap.test.js', 'js/tests/send-safety.test.js',
    'js/tests/automation-next.test.js',
    'experiments/issue-56/automatic-cap-fixture.mjs',
    'experiments/issue-56/probe-autopilot-cap-lifecycle.py',
    'experiments/issue-56/collect-autopilot-cap-lifecycle.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/autopilot-cap-lifecycle.md',
    *evidence_logs(root, 'autopilot-cap-lifecycle'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
parent = subprocess.check_output(['git', 'rev-parse', '448c2234'], cwd=root).decode().strip()
name = 'js/src/automation/autopilot.js'
entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, criteria=['QA20'], acceptance=False,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True,
    finalParentTests=4, parentFailures=2, focusedTests=72, liveProvider=False,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/autopilot-cap-lifecycle.tar.gz', entries)
