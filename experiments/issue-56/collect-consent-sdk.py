"""Preserve finite actual-adapter consent races and truthful receipt controls."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'consent-sdk')
parent_log = read('parent-final')
assert all(value in parent_log for value in ('pass 25', 'fail 48', 'cancelled 0'))
assert parent_log.count('AssertionError [ERR_ASSERTION]') == 48
assert all(value in read('focused-final') for value in ('pass 259', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'Changed sources and documents satisfy their line limits.' in read('limits')
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
report = 'ci-logs/duplication-sdk/jscpd-report.json'
duplication = json.loads((root / report).read_text())['statistics']['total']
assert duplication['percentage'] <= 6.5
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
names = changed_sources(root) + [report, '.jscpd.json',
    'js/src/automation/send-consent.js', 'js/src/automation/safety.js',
    'js/src/storage/acknowledged-record.js', 'js/src/storage/serialized.js',
    'js/src/crm/reengage.js', 'js/src/sources/http.js',
    'experiments/issue-56/consent-fixture.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'js/tests/helpers/fixture-server.mjs',
    'ci-logs/consent-sdk-source-review.diff',
    *[f'js/tests/{name}.test.js' for name in ['consent-provider',
        'consent-browser-answer', 'consent-browser-send', 'telegram-account',
        'telegram-text-receipts', 'email-node-transport', 'email-send-safety',
        'live-connectors']], *evidence_logs(root, 'consent-sdk')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', 'dfd3213b'], cwd=root).decode().strip()
for name in changed_sources(root):
    if name.startswith('js/src/'):
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['QA19', 'QA20'], acceptance=False, acceptedCriteria=88,
    unfinishedCriteria=30, parentFailures=48, focusedPasses=259,
    liveProvider=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/consent-sdk.tar.gz', entries)
