"""Preserve finite admission-race reproduction and acknowledged safety checks."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'consent-admission-{name}.log').read_text()
assert all(value in read('parent') for value in ('pass 2', 'fail 14', 'cancelled 0'))
assert all(value in read('focused') for value in ('pass 55', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 over the 1500 line limit' in read('limits')
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name
names = changed_sources(root)
names += ['js/src/automation/safety.js', 'js/src/storage/serialized.js',
          'js/src/storage/acknowledged-record.js',
          'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/previous-module.mjs',
          'js/tests/safety-settings-acknowledgement.test.js',
          'js/tests/safety-person.test.js', 'js/tests/send-safety.test.js',
          *evidence_logs(root, 'consent-admission')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', 'c31f12c1'], cwd=root).decode().strip()
entries['before/js/src/automation/outbox.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/automation/outbox.js'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['QA19', 'QA20'], acceptance=False, acceptedCriteria=88,
    unfinishedCriteria=30, parentFailures=14, focusedPasses=55,
    liveProvider=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/consent-admission.tar.gz', entries)
