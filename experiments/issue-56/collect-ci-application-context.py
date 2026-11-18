"""Preserve context regressions, native receipts and the failed hosted jobs."""
import json
from evidence_bundle import (
    evidence_context, changed_sources, evidence_logs, verify_evidence,
    bundle, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'ci-application-context')
verify_evidence(read, {
    'before': ['tests 29', 'pass 22', 'fail 7'],
    'parent': ['tests 6', 'pass 0', 'fail 6'],
    'focused-final': ['tests 73', 'pass 73', 'fail 0'],
    'native-popup': ['[e2e-job-application] OK (chromium)',
                     '"restoredActualAnswers":true',
                     '"browsersClosed":true', '"errors":[]'],
    'native-language': ['[e2e-ci-application-context] OK (chromium)',
                        '"ownerEditsPreserved":true',
                        '"ownerValuesPreserved":true',
                        '"browsersClosed":true', '"sends":0'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
for phase, status in [('before', 400), ('after', 200)]:
    receipt = json.loads((logs / f'ci-application-context-mcp-{phase}.json').read_text())
    result = json.loads(receipt['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert result['responseStatus'] == status
    assert result['automaticChoice'] is (phase == 'after')
    assert result['native']['closed'] and not result['native']['errors']
    assert not result['errors'] and result['liveProvider'] is False
    if phase == 'after':
        assert result['locales'] == 4 and result['phoneOverflow'] is False
    assert json.loads(read(f'mcp-{phase}-server').splitlines()[-1]) == {
        'resourcesClosed': True, 'liveProvider': False,
    }
sources = changed_sources(root) + evidence_logs(root, 'ci-application-context')
previous_jobs = sorted(logs.glob('checks-44016045317-*.log'))
current_jobs = sorted(logs.glob('checks-44019166892-*.log'))
assert len(previous_jobs) == 19, len(previous_jobs)
assert len(current_jobs) >= 13, len(current_jobs)
sources += [str(path.relative_to(root)) for path in previous_jobs + current_jobs]
sources += ['ci-logs/application-context-4089-run.json',
            'ci-logs/application-context-current-runs.json',
            'ci-logs/ci-application-context-mcp-runner.js']
bundle(root, sources,
    'docs/case-studies/issue-56/data/ci-application-context.tar.gz',
    dict(acceptance=False, parent='939a205b',
         previousNonPassingJobsPreserved=19,
         currentFailedJobsPreserved=len(current_jobs),
         previousChecks=29, previousFailures=7, regressionTests=6,
         parentPass=0, parentFail=6, focusedTests=73,
         nativePopupResourcesClosed=True, repairedNativeScenarios=2,
         independentMcpBeforeStatus=400, independentMcpAfterStatus=200,
         locales=4, phoneOverflow=False, resourcesClosed=True,
         unfinishedCriteria=40, exactSourceHostedVerificationRequired=True),
    'issue-56-ci-application-context/*.png',
    before=parent_reply_sources(root, sources, '939a205b'))
