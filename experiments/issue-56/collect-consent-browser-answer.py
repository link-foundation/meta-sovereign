"""Preserve finite native-answer consent races and truthful receipt controls."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'consent-browser-answer-{name}.log').read_text()
assert all(value in read('parent') for value in ('pass 10', 'fail 44', 'cancelled 0'))
assert read('parent').count('AssertionError [ERR_ASSERTION]') == 44
assert all(value in read('focused') for value in ('pass 151', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'Changed sources and documents satisfy their line limits.' in read('limits')
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name
names = changed_sources(root) + [
    'js/src/automation/send-consent.js', 'js/src/automation/safety.js',
    'js/src/server/redact.js', 'js/src/storage/serialized.js',
    'js/src/storage/acknowledged-record.js',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/consent-browser-send-fixture.mjs',
    'experiments/issue-56/provider-choice-fixture.mjs',
    'experiments/issue-56/text-reply-fixture.mjs',
    'ci-logs/consent-browser-answer-source-review.diff',
    *[f'js/tests/{name}.test.js' for name in ['consent-provider',
        'consent-browser-send', 'browser-choices', 'browser-text-reply',
        'browser-text-admission', 'browser-answer-watch', 'browser-sender']],
    *evidence_logs(root, 'consent-browser-answer')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', '5565c348'], cwd=root).decode().strip()
for module in ['browser-sender', 'browser-choices', 'browser-text-reply', 'browser-answer-watch']:
    path = f'js/src/sources/{module}.js'
    entries[f'before/{path}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{path}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['QA19', 'QA20'], acceptance=False, acceptedCriteria=88,
    unfinishedCriteria=30, parentFailures=44, focusedPasses=151,
    liveProvider=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/consent-browser-answer.tar.gz', entries)
