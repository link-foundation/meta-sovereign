"""Preserve the observed busy-port cancellation and finite startup regressions."""
import json
from evidence_bundle import (
    evidence_context, changed_sources, evidence_logs, verify_evidence,
    bundle,
)

root, logs, read = evidence_context(__file__, 'ci-busy-start')
verify_evidence(read, {
    'focused': ['pass 4', 'fail 0'],
    'before': ['pass 1', 'fail 3', 'Missing expected rejection'],
    'helper': ['pass 1', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
run = json.loads((logs / '4fefd-main-current.json').read_text())
assert run['headSha'] == '4fefd25471e803c5588ff5053d980b70c27aa9e2'
assert any(job['databaseId'] == 133788790554 and job['conclusion'] == 'failure'
           for job in run['jobs'])
hosted = (logs / 'checks-44007537939-windows-3.log').read_text()
assert 'snapshot_ready after 21602 ms' in hosted
assert '2091 files' in hosted and '30000.2229ms' in hosted
sources = changed_sources(root) + evidence_logs(root, 'ci-busy-start')
sources += ['ci-logs/checks-44007537939-windows-3.log',
            'ci-logs/4fefd-main-current.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-busy-port-startup.tar.gz',
       dict(parent='811b03a0', hosted='4fefd254', hostedRun=44007537939,
            hostedJob=133788790554, focusedTests=4, parentFailures=3,
            testTimeoutUnchanged=True, hostedVerificationPending=True,
            acceptance=False), 'issue-56-ci-busy-port/*.png',
       before={name: '811b03a0' for name in (
           'js/src/server/rolling-host.js', 'js/src/cli/rolling-serve.js',
       )})
