"""Preserve the real aggregate timeout and mandatory source-bound correction."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'application-browser-budgets')
parent = subprocess.check_output(['git', 'rev-parse', 'f0785c1b'], cwd=root).decode().strip()
failed = 'f34c800a53b6a2c7337677dc81c477642f88bfa7'
for name, fragments in {
    'before': ['pass 8', 'fail 2', 'sources restored'],
    'focused': ['pass 31', 'fail 0', 'skipped 0'],
    'webkit-skips': ['"scenario":"verifyNativeVacancySkips","phase":"passed"',
                     '"linkVariants":6', '"providerSubmissions":0', '"browsersClosed":true',
                     '[e2e-job-application-vacancy-skips] OK (webkit)'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
job = json.loads((logs / 'application-browser-budgets-failed-job.json').read_text())
assert job['id'] == 135121991350 and job['conclusion'] == 'failure'
assert job['head_sha'] == failed
failed_log = (logs / 'checks-f34c800a-webkit-4.log').read_text()
for fragment in ['ETIMEDOUT', 'elapsedMs":103462', 'elapsedMs":32199',
                 'elapsedMs":27999', 'Completed job-application-feedback in 180131ms']:
    assert fragment in failed_log, fragment

names = [*changed_sources(root), *evidence_logs(root, 'application-browser-budgets'),
         'ci-logs/checks-f34c800a-webkit-4.log', 'ci-logs/checks-f34c800a-webkit-4.zip']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['package.json', 'js/scripts/browser-checks.json',
             'js/tests/e2e-job-application-feedback-browser.mjs',
             'js/tests/e2e-job-application-visibility-browser.mjs',
             'js/tests/helpers/e2e-vacancy-skips.mjs']:
    data = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
    assert data == subprocess.check_output(['git', 'show', f'{failed}:{name}'], cwd=root)
    entries[f'before/{name}'] = data
entries['metadata.json'] = (json.dumps({
    'implementationParent': parent, 'failedSource': failed,
    'failedRun': 44392503456, 'failedJob': 135121991350, 'failedArtifact': 14471913647,
    'parentFailures': 2, 'parentIndependentControls': 8, 'focusedPassed': 31,
    'localWebkitScenarios': 1, 'registeredScenarios': 37, 'browserEntries': 160,
    'shardsPerEngine': 8, 'maximumEntriesPerShard': 20,
    'entryDeadlineMs': 180000, 'jobDeadlineMinutes': 35,
    'remainingOriginalCriteria': 30, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-browser-budgets.tar.gz', entries)
