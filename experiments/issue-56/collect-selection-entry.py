"""Preserve an unresolved native-entry failure and bounded diagnostics."""
import json
from pathlib import Path
import re
from zipfile import ZipFile
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
failed = json.loads((logs / 'hosted-593-checks-attempt-1.json').read_text())
assert failed['headSha'] == '5936c54435477feceab16c2ce6d8db6f74e22817'
assert failed['conclusion'] == 'failure'
job = next(j for j in failed['jobs'] if j['databaseId'] == 133298002525)
assert job['conclusion'] == 'failure'
raw = (logs / 'hosted-593-webkit-4.log').read_text()
assert '"terms":""' in raw and 'needs-description' in raw
assert 'Timeout 30000ms exceeded' in raw
native = (logs / 'selection-entry-webkit.log').read_text()
assert '[e2e-vacancy-selection] OK (webkit)' in native
snapshots = [json.loads(line.split('] ', 1)[1]) for line in native.splitlines()
             if line.startswith('[vacancy-selection-input]')]
assert len(snapshots) == 4, 'trace successful searches, including cleared selection'
assert all(len(s['events']) <= 60 for s in snapshots)
first = next(f for f in snapshots[0]['controls'] if f['field'] == 'excludeText')
assert first['length'] == first['renderedLength'] == 15
assert first['renderedMatches'] is True
focused = (logs / 'selection-entry-focused.log').read_text()
assert re.search(r'\bpass 2\b', focused) and re.search(r'\bfail 0\b', focused)
for tag in ['lint', 'diff']:
    assert not (logs / f'selection-entry-{tag}.log').read_text().strip(), tag
assert 'All matched files use Prettier code style!' in (logs / 'selection-entry-format-check.log').read_text()
names = [
    'js/tests/browser-input-trace.test.js',
    'js/tests/resume-input-trace.test.js',
    'js/tests/helpers/e2e-input-trace.mjs',
    'js/tests/helpers/e2e-vacancy-selection.mjs',
    'js/tests/helpers/e2e-vk-cache.mjs',
    'experiments/issue-56/vacancy-selection-browser.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/collect-selection-entry.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-selection-entry.md',
    'docs/case-studies/issue-56/ci-selection-entry-plan.md',
    'docs/screenshots/issue-56-vacancy-selection/hosted-593-failure.png',
    'ci-logs/hosted-593-checks-attempt-1.json',
    'ci-logs/hosted-593-webkit-4.log',
    'ci-logs/hosted-593-pipeline-failure.log',
]
names += [str(path.relative_to(root)) for path in logs.glob('selection-entry-*.log')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
with ZipFile(logs / 'hosted-593-webkit-4-artifacts.zip') as archive:
    entries['failed-artifact/summary.json'] = archive.read('summary.json')
for name in ['after', 'phone']:
    path = logs / f'selection-entry-screenshots/vacancy-selection-{name}.png'
    entries[str(path.relative_to(root))] = path.read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    failedSha=failed['headSha'], run=43866354517, attempt=1,
    failedJob=job['databaseId'], artifact=14228426951,
    focusedNode=2, localWebkitCases=1, eventCap=60,
    hostedCause='unproven', productBehaviorChanged=False,
    assertionsChanged=False, deadlinesChanged=False,
    completedCriteria=[], remainingCriteria=60, liveProvider=False,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-selection-entry.tar.gz', entries)
