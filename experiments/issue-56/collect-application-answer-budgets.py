"""Bind the separate salary deadline to exact hosted and finite local evidence."""
import json
import subprocess
from evidence_bundle import (bundle, changed_sources, evidence_context,
                             evidence_logs, verify_evidence)

root, logs, read = evidence_context(__file__, 'application-answer-budgets')
verify_evidence(read, {
    'before': ['pass 10', 'fail 1', 'sources restored'],
    'focused': ['pass 31', 'fail 0', 'skipped 0'],
    'webkit': ['"phase":"passed"', '"elapsedMs":66675', '"deliveries":2',
               '"locales":4', '"restartReplayed":false', '"browserClosed":true'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['Scoped source and documentation limits pass'],
}, empty=('lint', 'secrets', 'diff'))
job_path = 'ci-logs/hosted-9c369eaf-webkit-5-135207203393-job.json'
job = json.loads((root / job_path).read_text())
assert (job['id'], job['run_id'], job['conclusion']) == (
    135207203393, 44418378152, 'failure')
assert job['head_sha'] == '9c369eaf45d8d33c2b095924d7f956defef2ee3c'
log_path = 'ci-logs/hosted-9c369eaf-webkit-5-135207203393.log'
failed_lines = (root / log_path).read_text().splitlines()
assert len(failed_lines) == 1020
assert 'ETIMEDOUT' in failed_lines[930]
assert '180887ms; exit 1' in failed_lines[937]
parent = subprocess.check_output(['git', 'rev-parse', '5525aaa0'], cwd=root).decode().strip()
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application-answer-budgets'),
              log_path, job_path],
       'docs/case-studies/issue-56/data/application-answer-budgets.tar.gz', {
           'actualParent': parent, 'failedSource': job['head_sha'],
           'failedRun': job['run_id'], 'failedJob': job['id'],
           'parentFailures': 1, 'parentControls': 10, 'focusedPassed': 31,
           'nativeWebkitElapsedMs': 66675, 'offlineFixtureSubmissions': 2,
           'applicationScenarios': 38, 'browserEntries': 160,
           'shardsPerEngine': 8, 'entriesPerShard': 20,
           'entryDeadlineMs': 180000, 'jobDeadlineMinutes': 35,
           'remainingOriginalCriteria': 30, 'issueComplete': False,
           'hostedVerification': 'pending publication',
       }, 'application-answer-budgets/*.png', before={
           name: parent for name in ['package.json', 'js/scripts/browser-checks.json',
                                     'js/tests/e2e-job-application-answers-browser.mjs']
       })
