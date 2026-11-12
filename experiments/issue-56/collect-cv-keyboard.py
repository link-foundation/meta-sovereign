"""Preserve native focus checks and unresolved disclosure recurrence metadata."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-keyboard')
assert 'pass 3' in read('ci-contracts')
assert '"focused":true,"enabled":true' in read('vacancy-webkit')
assert '"focused":true,"enabled":true' in read('review-webkit')
assert '"cases":4,"providerReads":0' in read('vacancy-webkit')
assert '"cases":4,"providerReads":0' in read('review-webkit')
assert '[e2e-follow-chats] OK (webkit)' in read('follow-webkit')
assert '"type":"toggle"' in read('follow-webkit')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert 'ERROR' not in read('duplication')
base = '74c09421cb7a1c4f1b62d1a6a7b4de2aa3ed9a45'
bundle(root, changed_sources(root, base) + evidence_logs(root, 'cv-keyboard'),
       'docs/case-studies/issue-56/data/ci-cv-keyboard.tar.gz',
       dict(published_base=base, workflow_contracts=3, native_technology_cases=8,
            native_follow_workflows=1, provider_reads=0,
            hosted_failure=dict(commit='8c4bfc6c468e5578c5a248ee8f0c4e0cedcb0707',
                                run=43177885613, job=131048574094),
            unfinished='macOS keyboard confirmation, Follow disclosure root cause, exact-head CI and every unchecked product criterion'),
       'issue-56-cv-keyboard/**/*.png',
       before={name: base for name in [
           'js/tests/helpers/e2e-vacancy-technologies.mjs',
           'js/tests/e2e-follow-chats-browser.mjs']})
