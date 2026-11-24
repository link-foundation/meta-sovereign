"""Preserve finite connection/fallback consent races and compatible delivery."""
import json
from pathlib import Path
import re
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'consent-provider-{name}.log').read_text()
assert all(value in read('parent') for value in ('pass 3', 'fail 14', 'cancelled 0'))
assert read('parent').count('AssertionError [ERR_ASSERTION]') == 14
assert all(value in read('focused') for value in ('pass 112', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 over the 1500 line limit' in read('limits')
assert re.sub(r'\b\d+:\d+\b', '*:*', read('lint')) == re.sub(
    r'\b\d+:\d+\b', '*:*', read('lint-baseline'))
assert '1 problem (0 errors, 1 warning)' in read('lint')
for name in ('secrets', 'diff'):
    assert not read(name).strip(), name
names = changed_sources(root) + [
    'js/src/automation/safety.js', 'js/src/server/redact.js',
    'js/src/crm/reengage.js', 'js/src/storage/serialized.js',
    'js/src/storage/acknowledged-record.js',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/consent-admission-fixture.mjs',
    'ci-logs/consent-provider-source-review.diff',
    *[f'js/tests/{name}.test.js' for name in ['consent-admission',
        'send-adapter-options', 'browser-sender', 'browser-choices',
        'send-safety', 'telegram-extra-accounts']],
    *evidence_logs(root, 'consent-provider')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', '72dc9552'], cwd=root).decode().strip()
for name in ['js/src/sources/browser-sender.js', 'js/src/automation/outbox.js',
             'js/src/server/index.js', 'js/src/server/telegram-extras.js',
             'js/src/cli/automation-commands.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['QA19', 'QA20'], acceptance=False, acceptedCriteria=88,
    unfinishedCriteria=30, parentFailures=14, focusedPasses=112,
    liveProvider=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/consent-provider.tar.gz', entries)
