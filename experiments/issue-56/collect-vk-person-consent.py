"""Preserve finite independent VK person-consent regressions and parent bytes."""
import hashlib
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'vk-person-consent')
verify_evidence(read, {
    'initial-before': ['tests 52', 'fail 39', 'pass 13'],
    'before': ['tests 55', 'fail 45', 'pass 10', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 107', 'pass 107', 'fail 0', 'cancelled 0', 'skipped 0'],
    'build': ['Done in'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('lint', 'secrets', 'diff'))
names = [
    'vk-greet-planner', 'vk-reengage-planner', 'vk-cancelled-planner',
    'vk-personal-policy', 'vk-discovery-planner', 'vk-discovery-guards',
    'vk-retention-planner', 'vk-retention-guards', 'vk-personal-job',
    'vk-reengage-payload', 'vk-friends-planner', 'vk-friends-executor',
    'vk-maintenance',
]
production = [f'js/src/automation/{name}.js' for name in names]
sources = [
    *production, 'js/src/automation/vk-safety-target.js',
    'js/src/automation/safety.js', 'js/src/automation/outbox.js',
    'js/src/automation/vk-outgoing-pacing.js',
    'js/tests/vk-person-consent.test.js',
    'experiments/issue-56/vk-person-consent-fixture.mjs',
    'experiments/issue-56/probe-vk-person-consent.py',
    'experiments/issue-56/collect-vk-person-consent.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/vk-person-consent.md',
    *[f'js/tests/{name}.test.js' for name in [
        'vk-greet-guards', 'vk-reengage-guards', 'vk-friends',
        'vk-maintenance', 'vk-retention-guards', 'vk-discovery-guards']],
    *[f'experiments/issue-56/vk-{name}-fixture.mjs' for name in [
        'cancelled', 'greet', 'birthday', 'reengage', 'friends',
        'maintenance', 'discovery', 'retention', 'wall']],
    *evidence_logs(root, 'vk-person-consent'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
parent = subprocess.check_output(['git', 'rev-parse', 'fe44affd'], cwd=root).decode().strip()
for name in production:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, criteria=['QA19', 'QA20'], acceptance=False,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True,
    finalParentTests=55, parentFailures=45, focusedTests=107,
    policyVariants=13, liveProvider=False,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-person-consent.tar.gz', entries)
