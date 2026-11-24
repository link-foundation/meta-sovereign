"""Preserve a hosted timeout without promoting an unreproduced cause to a fix."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
source = 'js/tests/helpers/e2e-application-batch.mjs'
parent = 'e2acf88a7bdee8ba4df94015036b612463e7ebed'
names = [source, 'experiments/issue-56/batch-confirmation-native.mjs',
    'experiments/issue-56/collect-batch-confirmation.py',
    'docs/case-studies/issue-56/ci-batch-confirmation.md',
    'ci-logs/hosted-e2acf88a-134567899964.log',
    'ci-logs/hosted-verification-e2acf88a-checks.json',
    'ci-logs/batch-confirmation-native.log']
names += [str(p.relative_to(root)) for p in (root / 'ci-logs/batch-confirmation-smoke').glob('*.png')]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/' + source] = subprocess.check_output(['git', 'show', f'{parent}:{source}'], cwd=root)
receipt = json.loads(entries['ci-logs/batch-confirmation-native.log'])
assert receipt == dict(deliveries=2, manualDeliveries=1, queueRevisits=2, entryClicks=0,
    locales=4, phone=True, reloadReplayed=False, resourcesClosed=True)
assert b'Timeout 10000ms exceeded' in entries['ci-logs/hosted-e2acf88a-134567899964.log']
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-batch-confirmation.tar.gz', entries)
