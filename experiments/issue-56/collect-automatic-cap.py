"""Preserve finite automatic daily-cap regressions and exact parent bytes."""
import hashlib
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'automatic-cap')
verify_evidence(read, {
    'before': ['tests 36', 'fail 24', 'pass 12', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 90', 'pass 90', 'fail 0', 'cancelled 0', 'skipped 0'],
    'build': ['Done in'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('lint', 'secrets', 'diff'))
production = [f'js/src/automation/{name}.js' for name in
              ['outbox', 'deliver', 'paced-send', 'autopilot']]
sources = [
    *production, 'js/src/storage/serialized.js',
    'js/tests/automatic-cap.test.js',
    'experiments/issue-56/automatic-cap-fixture.mjs',
    'experiments/issue-56/probe-automatic-cap.py',
    'experiments/issue-56/collect-automatic-cap.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/automatic-cap.md',
    *[f'js/tests/{name}.test.js' for name in [
        'send-safety', 'automations', 'automation-next',
        'question-outbox-flush', 'vk-queue-runner']],
    *evidence_logs(root, 'automatic-cap'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
parent = subprocess.check_output(['git', 'rev-parse', '6f7bdd6f'], cwd=root).decode().strip()
for name in production:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, criteria=['QA20'], acceptance=False,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True,
    finalParentTests=36, parentFailures=24, focusedTests=90,
    providerIdentities=['hh', 'telegram', 'vk', 'email', 'whatsapp'],
    liveProvider=False,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/automatic-cap.tar.gz', entries)
