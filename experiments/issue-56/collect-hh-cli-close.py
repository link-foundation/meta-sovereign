"""Preserve bounded HH CLI shutdown evidence without claiming a hosted root cause."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'hh-cli-close')
assert 'pass 5' in read('node') and 'fail 0' in read('node')
assert '5 passed | 0 failed' in read('deno')
for runtime in ('node', 'deno'):
    for mode in ('unfinished', 'drained'):
        records = [json.loads(line) for line in read(f'probe-{runtime}-{mode}').splitlines()
                   if line.startswith('{')]
        assert [row['phase'] for row in records[:4]] == [
            'cli-1', 'cli-2', 'cli-3', 'store-verified-and-closed']
        observed = next(row for row in records if row['phase'] == 'close-observed')
        assert observed['closed'] is (mode == 'drained')
        assert observed['owned'] is (mode == 'drained')
        assert records[-1]['phase'] == 'owned-sockets-drained'
assert not read('lint').strip()
assert not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
parent = 'c40c0c86f1b10c85fd5b206649bd3b22640a34c0'
bundle(root, [*changed_sources(root), *evidence_logs(root, 'hh-cli-close'),
              'ci-logs/application-fullform-parent-macos-deno.log',
              'js/tests/helpers/fixture-server.mjs', 'js/tests/fixture-server.test.js',
              'experiments/issue-56/hh-common-fixture.mjs'],
       'docs/case-studies/issue-56/data/ci-hh-cli-fixture.tar.gz', {
           'parent': parent, 'hosted_failed_head': '6899b33b',
           'hosted_failed_job': 132403292910,
           'node_focused': 5, 'deno_focused': 5,
           'controlled_unfinished_response_reproduces_wait': True,
           'original_hosted_timeout_root_cause_established': False,
           'existing_timeout_ms': 15000, 'observation_window_ms': 500,
           'original_inventory_unchecked': 81, 'issue_complete': False,
           'exact_head_ci_still_required': True,
       }, 'hh-cli-fixture-no-screenshots-*.png', before={
           'js/tests/hh-common-controls.test.js': parent})
