"""Preserve the exact-source browser registration failure and correction."""
import json
import subprocess
from evidence_bundle import evidence_context, write_entries_archive

root, logs, _read = evidence_context(__file__, 'ci-vacancy-groups')
assert 'fail 1' in (logs / 'ci-vacancy-groups-before.log').read_text()
assert 'pass 8' in (logs / 'ci-vacancy-groups-after.log').read_text()
assert 'vacancies combines 5 native scenarios' in (logs / 'ci-d48-contract-failure.log').read_text()
files = [
    'js/tests/ci-browser-shards.test.js',
    'js/tests/e2e-vacancies-browser.mjs',
    'js/tests/e2e-vacancy-loading-browser.mjs',
    'js/scripts/browser-checks.json',
    'ci-logs/ci-d48-contract-failure.log',
    'ci-logs/ci-vacancy-groups-before.log',
    'ci-logs/ci-vacancy-groups-after.log',
    'docs/case-studies/issue-56/ci-vacancy-groups.md',
    'experiments/issue-56/collect-ci-vacancy-groups.py',
    'experiments/issue-56/evidence_bundle.py',
]
entries = {name: (root / name).read_bytes() for name in files}
parent = 'd48a617927cf6d33aa332b88485068fcb38401e4'
for name in files[:3]:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', parent + ':' + name], cwd=root)
entries['metadata.json'] = json.dumps(dict(
    parent=parent, failedRun=44286298815, beforeFailed=1, afterPassed=8,
    acceptedInventoryRows=[], issueComplete=False,
), indent=2).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-vacancy-groups.tar.gz', entries)
