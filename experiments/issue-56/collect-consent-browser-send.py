"""Preserve finite late-consent browser races and issued-result controls."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'consent-browser-send-{name}.log').read_text()
assert all(value in read('parent') for value in ('pass 5', 'fail 28', 'cancelled 0'))
assert read('parent').count('AssertionError [ERR_ASSERTION]') == 28
assert all(value in read('focused') for value in ('pass 79', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 over the 1500 line limit' in read('limits')
assert 'All documentation files are within the 2500 line limit.' in read('limits')
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name
names = changed_sources(root) + [
    'js/src/automation/send-consent.js', 'js/src/automation/safety.js',
    'js/src/server/redact.js', 'js/src/storage/serialized.js',
    'js/src/storage/acknowledged-record.js',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'ci-logs/consent-browser-send-source-review.diff',
    *[f'js/tests/{name}.test.js' for name in ['consent-provider',
        'browser-sender']],
    *evidence_logs(root, 'consent-browser-send')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', '79addf4d'], cwd=root).decode().strip()
path = 'js/src/sources/browser-sender.js'
entries[f'before/{path}'] = subprocess.check_output(
    ['git', 'show', f'{parent}:{path}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['QA19', 'QA20'], acceptance=False, acceptedCriteria=88,
    unfinishedCriteria=30, parentFailures=28, focusedPasses=79,
    liveProvider=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/consent-browser-send.tar.gz', entries)
