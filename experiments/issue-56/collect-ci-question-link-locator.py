"""Preserve the exact hosted strict-locator failure and focused correction."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-question-link-locator')
assert 'strict mode violation' in read('parent') and 'resolved to 2 elements' in read('parent')
assert all(value in read('native') for value in [
    '"cases":4', '"pageErrors":[]', '"staleChoiceSent":false',
    '"explicitFreshReplies":1', '"resourcesClosedOnExit":true', 'OK (chromium)',
])
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
run = json.loads((logs / 'vk-greeting-parent-ci-checks.json').read_text())
assert run['headSha'] == '0a6283651778b914102c6ddb49a19d29cbf80070'
assert run['createdAt'] == '2026-11-15T01:26:35Z'
job = next(j for j in run['jobs'] if j['databaseId'] == 132657458807)
assert job['conclusion'] == 'failure'
bundle(root, changed_sources(root) + evidence_logs(root, 'ci-question-link-locator') + [
    'ci-logs/vk-greeting-parent-ci-checks.json',
    'ci-logs/vk-greeting-parent-ci-browser-e2e-chromium-shard-2-4-132657458807.log',
], 'docs/case-studies/issue-56/data/ci-question-link-locator.tar.gz',
       dict(parent=run['headSha'], run=run['databaseId'], job=job['databaseId'],
            parent_failure='strict mode violation: two exact destination matches',
            native_cases=4, stale_sends=0, fresh_replies=1,
            all_original_unchecked_requirements=79, issue_complete=False,
            hosted_checks_pending=True), 'no-question-link-locator-screenshot',
       before={'js/tests/helpers/e2e-question-hidden-links.mjs': run['headSha']})
