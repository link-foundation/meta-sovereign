"""Preserve finite Stop ownership evidence without claiming full QA20 acceptance."""
import hashlib
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'autopilot-stop')
verify_evidence(read, {
    'before': ['tests 23', 'fail 22', 'pass 1', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 72', 'pass 72', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('lint', 'secrets', 'diff'))
sources = [
    'js/src/automation/autopilot.js', 'js/src/automation/autopilot-owners.js',
    'js/src/automation/delivery-owner.js', 'js/src/automation/runner.js',
    'js/src/automation/next-chat.js', 'js/src/automation/deliver.js',
    'js/src/automation/ordered-reply.js', 'js/src/automation/vk-queued-delivery.js',
    'js/src/automation/vk-outgoing-queue.js', 'js/src/automation/outbox.js',
    'js/src/server/index.js',
    'js/tests/autopilot-stop-ownership.test.js',
    'js/tests/autopilot-control-ownership.test.js',
    'js/tests/autopilot-cap-lifecycle.test.js',
    'js/tests/send-safety.test.js', 'js/tests/automation-next.test.js',
    'js/tests/vk-engagement.test.js',
    'experiments/issue-56/autopilot-stop-fixture.mjs',
    'experiments/issue-56/automatic-cap-fixture.mjs',
    'experiments/issue-56/vk-engagement-fixture.mjs',
    'experiments/issue-56/probe-autopilot-stop.py',
    'experiments/issue-56/collect-autopilot-stop.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/autopilot-stop.md',
    *evidence_logs(root, 'autopilot-stop'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
parent = subprocess.check_output(['git', 'rev-parse', '2769b823'], cwd=root).decode().strip()
for name in sources:
    if name.startswith('js/src/') and name not in (
            'js/src/automation/autopilot-owners.js', 'js/src/automation/delivery-owner.js'):
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, criteria=['QA20'], acceptance=False,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True,
    finalParentTests=23, parentFailures=22, focusedTests=72, liveProvider=False,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/autopilot-stop.tar.gz', entries)
