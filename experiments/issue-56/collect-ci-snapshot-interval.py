"""Preserve the adaptive snapshot assertion and its bounded correction."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'snapshot-interval')
parent = json.loads(read('parent-final'))
assert parent['parentAssertionReproduced'] and parent['outstandingTimers'] == 0
assert 'pass 3' in read('focused-final') and 'fail 0' in read('focused-final')
assert '3 passed | 0 failed' in read('deno')
assert 'pass 6' in read('mirror') and 'fail 0' in read('mirror')
assert 'higher priority waiting request' in (
    logs / 'snapshot-interval-webkit-annotations.json').read_text()
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'All matched files' in read('format-final')
assert '6.49%' in read('duplication-final')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'snapshot-interval'),
              'ci-logs/checks-43542772532.log',
              'ci-logs/checks-43542772532-windows-deno-shard3.log',
              'ci-logs/checks-43542772532-webkit-shard1.log'],
       'docs/case-studies/issue-56/data/ci-snapshot-interval.tar.gz',
       dict(parent='4f482c34def7547590889f0639fd1dca81baacf1',
            hosted_job=132290872116, node_tests=3, deno_tests=3,
            mirror_tests=6, production_timing_policy_changed=False,
            hosted_write_cost_measured=False, deadlines_increased=False,
            exact_head_ci_required=True, issue_complete=False),
       'no-snapshot-interval-images-*',
       before={'js/src/storage/doublets-store.js': '4f482c34',
               'js/tests/store-append.test.js': '4f482c34'})
