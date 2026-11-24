"""Preserve actual-parent Stop races, owned drainage and truthful receipts."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'dispatch-stop')
parent_log = read('parent-final')
assert all(value in parent_log for value in ('tests 70', 'pass 25', 'fail 45', 'cancelled 0'))
assert parent_log.count('AssertionError [ERR_ASSERTION]') == 45
assert all(value in read('focused-final') for value in ('pass 383', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'Changed sources and documents satisfy their line limits.' in read('limits')
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
report = 'ci-logs/duplication-stop/jscpd-report.json'
duplication = json.loads((root / report).read_text())['statistics']['total']
assert duplication['percentage'] <= 6.5
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
names = changed_sources(root) + [report, '.jscpd.json',
    'js/src/automation/delivery-owner.js', 'js/src/automation/send-consent.js',
    'js/src/automation/autopilot.js', 'js/src/automation/autopilot-owners.js',
    'js/src/automation/next-chat.js', 'js/src/automation/outbox.js',
    'js/src/automation/runner.js', 'js/src/automation/safety.js',
    'experiments/issue-56/consent-fixture.mjs',
    'experiments/issue-56/consent-smtp-fixture.mjs',
    'experiments/issue-56/automatic-cap-fixture.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'ci-logs/dispatch-stop-source-review.diff',
    *[f'js/src/sources/{name}.js' for name in ['vk', 'telegram-account',
        'telegram', 'whatsapp', 'email-live', 'email-node-transport']],
    *[f'js/tests/{name}.test.js' for name in ['consent-sdk', 'consent-provider',
        'consent-browser-answer', 'consent-browser-send', 'browser-sender',
        'telegram-text-receipts', 'email-node-transport', 'email-send-safety',
        'autopilot-stop-ownership', 'autopilot-control-ownership',
        'autopilot-cap-lifecycle', 'automatic-cap', 'consent-admission']],
    *evidence_logs(root, 'dispatch-stop')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', '2761c35b'], cwd=root).decode().strip()
for name in changed_sources(root):
    if name.startswith('js/src/'):
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['QA19', 'QA20'], acceptance=False, acceptedCriteria=88,
    unfinishedCriteria=30, parentFailures=45, parentControls=25,
    focusedPasses=383, liveProvider=False, hostedVerificationPending=True),
    indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/dispatch-stop.tar.gz', entries)
