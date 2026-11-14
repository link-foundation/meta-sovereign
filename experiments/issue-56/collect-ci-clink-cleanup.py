"""Retain actual-parent cleanup failures and focused client verification."""
from pathlib import Path
import re
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = 'b73f3433dc050922b0747d0fe4f8f52eba1f8e26'
read = lambda name: (root / f'ci-logs/clink-cleanup-{name}.log').read_text()
assert 'exceededObservation":true' in read('before')
assert 'failed reconnect assertion leaked its fixture server' in read('before')
assert '0 !== 1' in read('startup-before')
assert 'not match' in read('queue-before') or '3 !== 1' in read('queue-before')
assert 'exceededObservation":false' in read('after')
assert 'clink query timed out' in read('after')
assert 'pass 12' in read('node') and 'fail 0' in read('node')
assert '11 passed | 0 failed | 1 ignored' in read('deno')
assert not read('lint')
assert 'All workflows enforce runner, deadline and checkout policy' in read('workflow')
assert 'All matched files use Prettier code style!' in read('format-check')
assert not read('secrets')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
columns = [column.strip() for column in total.split('│') if column.strip()]
assert int(columns[5].split()[0]) / int(columns[2]) * 100 <= 6.5
bundle(root, [
    *changed_sources(root, parent),
    *(name for name in evidence_logs(root, 'clink-cleanup')
      if not name.endswith('inactive-run-43090337128.log')),
    'ci-logs/inactive-history-macos-node-130752686210.log',
], 'docs/case-studies/issue-56/data/ci-clink-cleanup.tar.gz', {
    'parent': parent, 'actual_parent_failures': 3,
    'node_checks': 12, 'deno_checks': 11, 'live_integration_skipped': True,
    'probe_observation_ms': 2000, 'ci_observation_ms': 10000,
    'fixture_query_ms': 300, 'ci_job_minutes': 10,
    'remaining': 'Original intermittent macOS assertion, exact-head CI and every unchecked product criterion.',
}, 'issue-56-ci-clink-cleanup/*.png', before={
    name: parent for name in (
        'js/src/storage/clink.js', 'js/tests/reply-store-clink.test.js',
        '.github/workflows/release.yml')
})
