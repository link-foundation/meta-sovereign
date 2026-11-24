"""Retain the measured combined deadline and the mandatory salary split."""
import json
import subprocess
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
trace = root / 'ci-logs/hosted-06953e31-webkit-2.log'
values = [json.loads(line.split('[browser-scenario] ', 1)[1])
          for line in trace.read_text().splitlines() if '[browser-scenario] ' in line]
question = [v for v in values if v['group'] == 'question-controls']
completed = [v for v in question if v['phase'] == 'passed']
assert len(completed) == 6 and sum(v['elapsedMs'] for v in completed) > 170000
assert question[-1]['scenario'] == 'verifySalaryVocabulary'
assert question[-1]['phase'] == 'started'
assert 'Completed question-controls in 180142ms; exit 1' in trace.read_text()
prefix = 'ci-logs/ci-salary-browser-groups-'
for suffix, markers in {
    'before.log': ['fail 1', 'ENOENT'],
    'after.log': ['pass 1', 'fail 0'],
    'registration.log': ['pass 6', 'fail 0'],
    'native.log': ['[e2e-question-salary-context] OK (webkit)',
                   '"ownerDraftPreserved":true', '"narrowLayout":true'],
    'format.log': ['All matched files use Prettier code style!'],
}.items():
    text = (root / (prefix + suffix)).read_text()
    assert all(marker in text for marker in markers), suffix
native = (root / (prefix + 'native.log')).read_text()
assert native.count('"phase":"passed"') == 3
names = ['package.json', 'js/scripts/browser-checks.json',
         'js/tests/ci-contracts.test.js', 'js/tests/e2e-question-controls-browser.mjs',
         'js/tests/e2e-question-salary-context-browser.mjs',
         'js/tests/e2e-question-salary-wording-browser.mjs',
         'experiments/issue-56/collect-salary-context-hosted.py',
         'experiments/issue-56/collect-ci-salary-browser-groups.py',
         'experiments/issue-56/evidence_bundle.py',
         'docs/case-studies/issue-56/ci-salary-browser-groups.md',
         'ci-logs/06953e31-webkit-2-job.json', str(trace.relative_to(root))]
names += [str(p.relative_to(root)) for p in (root / 'ci-logs').glob(
    'ci-salary-browser-groups-*.log') if not p.name.endswith('-archive.log')]
entries = {name: (root / name).read_bytes() for name in names}
for name in names[:4] + ['experiments/issue-56/collect-salary-context-hosted.py']:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', f'06953e31:{name}'], cwd=root)
entries['metadata.json'] = json.dumps(dict(failedSource='06953e31',
    acceptance=False, focusedChecks=7, nativeScenarios=3, groupTimeoutMs=180000,
    jobTimeoutMinutes=35, vocabularyHangEstablished=False)).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-salary-browser-groups.tar.gz', entries)
