"""Archive a proven worker drain bug separately from unmeasured hosted latency."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'worker-eof')
for label, fragments in {
    'before': ('Worker retained initialization after input EOF.', 'EPIPE', 'fail 2'),
    'before-check': ('both children drained.',),
    'node-final': ('pass 7', 'fail 0', 'skipped 1'),
    'deno-final': ('8 passed | 0 failed',),
    'startup-profile': ('pass 1', 'fail 0', '[rolling-worker] spawning',
                        '[rolling-worker] init_started', '[rolling-worker] init_finished',
                        '[rolling-start] control_ready', '"code":0'),
    'format-check-final': ('All matched files use Prettier code style!',),
}.items():
    for fragment in fragments:
        assert fragment in read(label), (label, fragment)
assert not any(read(label).strip() for label in ('lint-final', 'secrets-final', 'diff-final'))
assert 'ERROR:' not in read('duplication-final')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
job = 'ci-logs/application-resume-parent-macos-132380690633.log'
failure = (root / job).read_text()
assert 'initial host readiness after 10034 ms' in failure and 'ENOTEMPTY' in failure
bundle(root, [*changed_sources(root), *evidence_logs(root, 'worker-eof'), job,
              'experiments/issue-56/rolling-startup-profile.mjs',
              'js/tests/worker-client.test.js', 'js/tests/rolling-cli-readiness.test.js',
              'js/tests/helpers/rolling-cli-readiness.mjs', 'js/tests/rolling-cli.test.js'],
       'docs/case-studies/issue-56/data/ci-worker-input-close.tar.gz', {
           'parent': '02303fc78b4fd0802c8c2686a3a6c567fa0cb2a1',
           'failed_ci_head': '1e6582c3adfe84bd383c28f9a45e98776fa869a0',
           'run': 43572547657, 'job': 132380690633,
           'node_pass': 7, 'node_runtime_skip': 1, 'deno_pass': 8,
           'production_cli_cases': 1, 'real_process_channel_regressions': 2,
           'new_channel_test_bound_ms': 15000, 'new_test_deadline_ms': 20000,
           'existing_readiness_budget_ms': 10000,
           'worker_orphan_reproduced': True, 'hosted_startup_cause_proven': False,
           'original_inventory_unchecked': 81, 'issue_complete': False,
           'exact_head_ci_still_required': True,
       }, 'ci-worker-input-close-*.png', before={name: '02303fc7' for name in (
           'js/bin/server-worker.js', 'js/src/server/worker-client.js')})
