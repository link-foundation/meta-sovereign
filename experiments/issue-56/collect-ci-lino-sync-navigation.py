"""Retain the unresolved hosted API loss and bounded native observations."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'lino-sync')
assert '[e2e-lino-sync] OK (webkit)' in read('native-trace')
assert '"api":true' in read('native-trace')
assert not read('trace-lint').strip() and not read('trace-secrets').strip()
assert 'All workflows enforce runner, deadline and checkout policy' in read('trace-policy')
assert 'ERROR' not in read('trace-duplication')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'lino-sync'),
              'ci-logs/lino-sync-parent-browser.zip',
              'ci-logs/unread-reply-view-job-130925134777.log'],
       'docs/case-studies/issue-56/data/ci-lino-sync-navigation.tar.gz',
       dict(hosted='123947451a46c18dcc94f1d424c9f66dc13f8a7b',
            root_cause_verified=False, local_native_webkit_passes=2,
            bounded_trace_events=24, next_hosted_trace_required=True),
       'issue-56-lino-sync/*.png')
