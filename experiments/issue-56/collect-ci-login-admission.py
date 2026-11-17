"""Retain the exact hosted admission failures and the finite CLI regression."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'cli-login-admission')
verify_evidence(read, {
    'before': ['fail 2', 'open returned usage'],
    'focused': ['pass 15', 'fail 0', 'skipped 0', 'cancelled 0'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
hosted = [f'ci-logs/d517e9d4-{runtime}-failed.log' for runtime in
          ['windows-node2', 'ubuntu-bun', 'ubuntu-deno1']]
for name in hosted:
    assert 'lightweight admission retains every ordinary registered command' in (root / name).read_text()
names = [
    'js/src/cli/command-names.js', 'js/src/cli/index.js',
    'js/src/cli/lino-args.js', 'js/tests/cli-help-imports.test.js',
    'js/tests/jobs-manual-login-controls.test.js',
    'docs/case-studies/issue-56/ci-login-admission.md',
    'experiments/issue-56/collect-ci-login-admission.py',
    'experiments/issue-56/evidence_bundle.py',
    *hosted, *evidence_logs(root, 'cli-login-admission'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', '010c255b'], cwd=root).decode().strip()
component = 'js/src/cli/command-names.js'
entries[f'before/{component}'] = subprocess.check_output(['git', 'show', f'{parent}:{component}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    failedHostedSource='d517e9d44f13f7daab4576bf458a03c64d39bd47',
    criterion='HH01', acceptance=False, focusedTests=15,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-login-admission.tar.gz', entries)
