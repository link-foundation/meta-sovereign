"""Retain separately proven test completion and unproven hosted refusal."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'Timeout 10000ms exceeded' in (logs / 'batch-confirmation-webkit-before.log').read_text()
for name in ['batch-confirmation-webkit-after.log', 'batch-confirmation-parent-before-native.log']:
    receipt = json.loads((logs / name).read_text().splitlines()[-1])
    assert receipt == dict(deliveries=2, manualDeliveries=1, queueRevisits=2,
        entryClicks=0, locales=4, phone=True, reloadReplayed=False, resourcesClosed=True)
assert 'fail 0' in (logs / 'batch-confirmation-focused.log').read_text()
assert not (logs / 'batch-confirmation-lint-final.log').read_text().strip()
names = [
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-browser-responses.mjs',
    'js/tests/helpers/e2e-application-batch.mjs',
    'js/tests/job-deferred-questions-interface.test.js',
    'js/tests/job-application-browser-responses.test.js',
    'experiments/issue-56/batch-confirmation-parent.py',
    'experiments/issue-56/batch-confirmation-webkit.mjs',
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/collect-batch-receipts.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-batch-receipts.md',
    '.changeset/visible-browser-defaults.md', 'PLAN.md',
]
names += [f'ci-logs/{name}' for name in [
    'batch-confirmation-webkit-before.log', 'batch-confirmation-webkit-after.log',
    'batch-confirmation-parent-before-native.log', 'batch-confirmation-parent-probe.log',
    'batch-confirmation-focused.log', 'batch-confirmation-lint-final.log',
    'batch-confirmation-format-final.log', 'batch-parent-rerun.log',
    'batch-confirmation-source-size.log', 'batch-confirmation-doc-size.log',
    'checks-44266058270-job-134672910804.log',
    'checks-44266058270-job-134672910805.log', 'security-44271153380.log',
]]
entries = {name: (root / name).read_bytes() for name in names}
for name in names[:1] + names[2:4]:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'3a742654:{name}'], cwd=root)
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-batch-receipts.tar.gz', entries)
