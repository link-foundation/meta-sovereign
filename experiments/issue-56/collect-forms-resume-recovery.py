"""Preserve exact-source native PDF/deletion integration evidence."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
prefix = 'ci-logs/forms-resume-recovery-'
parent = '1f0c7287b7869c2a41fea826c84723607d3156dd'
before = (root / f'{prefix}before.log').read_text()
after = (root / f'{prefix}after.log').read_text()
assert '[forms-configured-resume]' in before
assert 'assertion failed: discovery never writes a saved PDF selection' in before
assert '[e2e-forms-reader] OK (chromium)' in after and 'SKIP' not in after
receipts = {}
for kind in ['configured-resume', 'private-resume', 'private-model']:
    marker = f'[forms-{kind}] '
    found = [json.loads(line.split(marker, 1)[1]) for line in after.splitlines()
             if line.startswith(marker)]
    assert len(found) == 1
    receipt = found[0]
    assert receipt['closed'] and receipt['submissions'] == 0
    receipts[kind] = receipt
assert receipts['private-resume']['savedSelectionUnchanged']
assert receipts['private-resume']['changedSourceRefused'] == 'form-resume-changed'
assert receipts['private-resume']['ownerFileRetained']
assert receipts['private-model']['modelCalls'] == 2
assert receipts['private-model']['unknownPreserved'] and receipts['private-model']['ownerPreserved']
for name in ['lint', 'secrets', 'diff']:
    assert not (root / f'{prefix}{name}.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (root / f'{prefix}format-check.log').read_text()
run_path = 'ci-logs/hosted-verification-1f0c7287-checks.json'
run = json.loads((root / run_path).read_text())
assert run['headSha'] == parent
for engine, line in [('chromium', 1460), ('webkit', 1254)]:
    job = next(job for job in run['jobs'] if job['name'] == f'Browser e2e ({engine}, shard 4/4)')
    assert job['conclusion'] == 'failure'
    lines = (root / f'ci-logs/hosted-1f0c7287-{engine}-4.log').read_text().splitlines()
    assert 'assertion failed: discovery never writes a saved PDF selection' in lines[line - 1]
names = [run_path, *[f'ci-logs/hosted-1f0c7287-{engine}-4.log' for engine in ['chromium', 'webkit']],
    *[f'{prefix}{name}.log' for name in ['before', 'parent', 'after', 'lint', 'format-check', 'secrets', 'diff']],
    'js/tests/helpers/e2e-form-private-resume.mjs', 'js/tests/helpers/e2e-form-configured-resume.mjs',
    'js/tests/helpers/e2e-form-private-model.mjs', 'js/tests/e2e-forms-reader-browser.mjs',
    'js/src/storage/causal-writes.js', 'js/src/storage/sync-deletions.js',
    'js/src/forms/configured-resume.js', 'js/src/forms/private-resume.js',
    'experiments/issue-56/forms-resume-recovery-before.py',
    'experiments/issue-56/collect-forms-resume-recovery.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-forms-resume-recovery.md']
entries = {name: (root / name).read_bytes() for name in names}
name = 'js/tests/helpers/e2e-form-private-resume.mjs'
entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, hostedFailures=2,
    nativeReceipts=receipts, acceptedCriteria=[], fullLocalMatrix=False,
    issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-forms-resume-recovery.tar.gz', entries)
