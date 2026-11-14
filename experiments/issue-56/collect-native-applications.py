"""Preserve executor evidence before the browser interface is enabled."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs
root, logs, read = evidence_context(__file__, 'application')
assert 'pass 20' in read('focused') and 'fail 0' in read('focused')
assert 'pass 4' in read('registry') and 'fail 0' in read('registry')
assert 'pass 44' in read('verification') and 'job-application' in read('verification')
assert 'not a function' in read('before')
assert '"refusedChanges":4,"submission":1,"errors":[]' in read('native')
assert '[e2e-job-application] OK (chromium)' in read('native')
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application')],
       'docs/case-studies/issue-56/data/native-applications.tar.gz',
       dict(parent='8d16669e45c275fc341ddad3e5389a46ebd6efb2',
            focused=20, compatibility_passed=21, registry=4,
            native_scenarios=2, late_native_refusals=4,
            authenticated_provider=False, ui_enabled=False,
            issue_complete=False, exact_head_ci_required=True,
            unfinished=['browser UI', 'deferred retries', 'HH06', 'HH07', 'HH08', 'remaining original inventory']),
       'issue-56-application/*.png',
       before={name: '8d16669e' for name in ['js/src/jobs/service.js',
           'js/src/server/routes-vacancies.js', 'js/src/cli/vacancy-commands.js',
           'js/src/forms/review-prefill.js']})
