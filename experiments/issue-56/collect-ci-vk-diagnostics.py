"""Preserve exact-head hosted failure and the narrowly scoped fixture replay."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'ci-vk-diagnostics')
verify_evidence(read, {
    'parent': ['fail 1', '1 !== 0', 'Restored the actual-parent VK browser helper.'],
    'node': ['pass 13', 'fail 0'],
    'webkit': ['"savedTextRestored":true', '"pageErrors":[]', '"sends":0', 'OK (webkit)'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
job = logs / 'ci-vk-gratitude-53-webkit-2.log'
assert len(job.read_text().splitlines()) == 1859
assert 'due to access control checks.' in job.read_text()
assert 'e2e-vk-gratitude.mjs:80:12' in job.read_text()
run = json.loads((logs / 'vk-identity-ci-53-checks.json').read_text())
assert run['headSha'] == '53a8479253b7a75b2f39cfa6d06ac816f6f7be93'
assert run['conclusion'] == 'failure'
extra = evidence_logs(root, 'ci-vk-gratitude-53')
extra += ['ci-logs/vk-identity-ci-53-checks.json']
bundle(root, changed_sources(root) + evidence_logs(root, 'ci-vk-diagnostics') + extra,
       'docs/case-studies/issue-56/data/ci-vk-diagnostics.tar.gz',
       dict(parent=run['headSha'], failed_run=43668793618, failed_job=132674817667,
            parent_replay_failing=1, focused_policy_cases=13, native_webkit_cases=1,
            production_changed=False, issue_complete=False, hosted_checks_pending=True),
       'issue-56-ci-vk-diagnostics/*.png',
       before={'js/tests/helpers/vk-automation-browser.mjs': run['headSha']})
