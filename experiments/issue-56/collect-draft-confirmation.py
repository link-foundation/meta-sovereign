"""Preserve the exact stored-draft reproduction and focused verification."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, parent_reply_sources, verify_evidence

root, logs, read = evidence_context(__file__, 'draft-confirmation')
verify_evidence(read, {
    'before-node': ['fail 8', 'pass 0', '"providerCalls":1'],
    'parent-restored': ['Restored all actual-parent draft confirmation sources.'],
    'node-focused': ['pass 10', 'fail 0', '"providerCalls":0'],
    'deno': ['10 passed | 0 failed'],
    'node-final': ['pass 35', 'fail 0'],
    'format-final': ['All matched files use Prettier code style!'],
}, empty=('lint-final', 'secrets', 'diff'))
assert read('before-node').count('"providerCalls":1') == 8
assert read('node-focused').count('"providerCalls":0') == 8
assert 'fail 0' in read('compatibility')
sources = changed_sources(root)
bundle(root, sources + evidence_logs(root, 'draft-confirmation'),
       'docs/case-studies/issue-56/data/draft-confirmation.tar.gz',
       dict(parent='3cd0d746', parent_failing=8, focused_node=10, focused_deno=10,
            current_existing_compatibility=28, mutated_provider_calls_before=8,
            mutated_provider_calls_after=0, authenticated_provider_sessions=0,
            issue_complete=False, hosted_checks_pending=True),
       'draft-confirmation-none/*.png',
       before=parent_reply_sources(root, sources, '3cd0d746'))
