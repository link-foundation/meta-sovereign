"""Keep exact hosted registration refusal and the bounded corrected contracts."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs, changed_sources, verify_evidence

root, logs, read = evidence_context(__file__, 'application-ci')
verify_evidence(read, {
    'focused': ['pass 3', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
run = json.loads((logs / '811b-main-current.json').read_text())
assert run['headSha'] == '811b03a0d0e0f5bf9b8c734db9236b20f416bb84'
assert run['conclusion'] == 'failure'
failure = 'ci-logs/checks-44012731824-workflow-contract.log'
assert 'job-application combines 5 native scenarios' in (root / failure).read_text()
sources = changed_sources(root) + evidence_logs(root, 'application-ci')
sources += [failure, 'ci-logs/811b-main-current.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/application-ci-registration.tar.gz',
       dict(parent='086a6eb1', hosted='811b03a0', hostedRun=44012731824,
            focusedContracts=3, salaryScenarioExactlyOnce=True,
            deadlinesUnchanged=True, hostedVerificationPending=True, acceptance=False),
       'issue-56-application-ci/*.png', before={name: '811b03a0' for name in (
           'js/tests/e2e-job-application-browser.mjs',
           'js/tests/e2e-job-application-answers-browser.mjs',
           'js/tests/ci-browser-shards.test.js',
       )})
