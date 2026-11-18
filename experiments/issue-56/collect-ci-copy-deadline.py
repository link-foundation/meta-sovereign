"""Preserve the observed Windows deadline without repeating copy experiments."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-copy-deadline')
assert 'fail 1' in read('before')
assert 'Restored working workflow' in read('before')
assert 'pass 1' in read('node')
assert 'All workflows enforce runner, deadline and checkout policy' in read('workflow')
annotation = json.loads((logs / 'unread-reply-view-job-130925135004-annotations.json').read_text())
assert any('maximum execution time of 10m0s' in item['message'] for item in annotation)
bundle(root, [*changed_sources(root), *evidence_logs(root, 'ci-copy-deadline'),
              *[f'ci-logs/unread-reply-view-job-130925135004{suffix}' for suffix in (
                  '.log', '.json', '-annotations.json')]],
       'docs/case-studies/issue-56/data/ci-copy-deadline.tar.gz',
       dict(parent='fa5374e4a44b732eeeaf0f094c93931f0e43f457',
            hosted='123947451a46c18dcc94f1d424c9f66dc13f8a7b',
            tests_passed=4897, deadline_minutes=10,
            strategy_unchanged=True, hosted_verification_pending=True),
       'issue-56-ci-copy-deadline/*.png', before={
           '.github/workflows/release.yml': 'fa5374e4a44b732eeeaf0f094c93931f0e43f457'})
