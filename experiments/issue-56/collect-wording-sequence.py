"""Retain the finite shared-browser fixture regression and exact CI evidence."""
import hashlib
import json
import runpy
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
helper = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
logs = root / 'ci-logs'
before = (logs / 'wording-sequence-before.log').read_text()
after = (logs / 'wording-sequence-after.log').read_text()
assert 'Timeout 30000ms exceeded' in before and 'Observed answer turns: 1' in before
assert '[e2e-questions] OK (chromium)' in after
assert '"scenarios":3,"rulesRestored":true' in after
assert not (logs / 'wording-sequence-lint.log').read_text().strip()
assert not (logs / 'wording-sequence-diff.log').read_text().strip()
names = ['js/tests/e2e-questions-browser.mjs',
         'docs/case-studies/issue-56/ci-question-wording-fixtures.md',
         'experiments/issue-56/collect-wording-sequence.py']
entries = {name: (root / name).read_bytes() for name in names}
for name in ['wording-sequence-before.log', 'wording-sequence-after.log',
             'wording-sequence-lint.log', 'wording-sequence-format.log',
             'wording-sequence-diff.log', 'wording-sequence-runs.json',
             'wording-sequence-jobs.json', '83c5-browser-133664238751.log',
             '83c5-browser-133664238751.json', '83c5-deno-133664239991.log',
             '83c5-deno-133664239991.json']:
    entries['ci-logs/' + name] = (logs / name).read_bytes()
entries['before/js/tests/e2e-questions-browser.mjs'] = subprocess.check_output(
    ['git', 'show', '83c5b1f7:js/tests/e2e-questions-browser.mjs'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    acceptance=False, productionChanges=False,
    sourceHashes={name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                  for name in names},
    sequence=['final-period:5', 'equivalents:5', 'availability:1'],
    pending='Exact-source hosted verification and all 41 unchecked requirements',
), indent=2) + '\n').encode()
helper['write_entries_archive'](
    root / 'docs/case-studies/issue-56/data/ci-question-wording-fixtures.tar.gz', entries, len(names))
