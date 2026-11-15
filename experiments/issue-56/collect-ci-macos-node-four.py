"""Preserve the completed native tests cancelled at the hosted job deadline."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-macos-node-four')
assert 'fail 1' in read('before') and 'pass 23' in read('node')
assert 'skipped 1' in read('node') and 'fail 0' in read('node')
assert 'All workflows enforce runner, deadline and checkout policy' in read('policy')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert any('maximum execution time of 10m0s' in row['message'] for row in
           json.loads((logs / 'ci-macos-node-annotations.json').read_text()))
sources = ['.github/workflows/release.yml', 'js/tests/ci-node-shards.test.js',
           'docs/case-studies/issue-56/ci-macos-node-four.md',
           'experiments/issue-56/collect-ci-macos-node-four.py',
           'ci-logs/ci-macos-node-parent.log', 'ci-logs/ci-macos-node-annotations.json',
           'ci-logs/vk-maintenance-parent-checks-progress.json']
bundle(root, sources + evidence_logs(root, 'ci-macos-node-four'),
       'docs/case-studies/issue-56/data/ci-macos-node-four.tar.gz',
       dict(failed_head='4dca94624c65cb4dd624654baa96cf233483fffe', node_pass=23,
            node_skip=1, fixture_files=6, unchanged_deadline_minutes=10,
            native_shards=4, issue_complete=False, hosted_verification_pending=True),
       'no-macos-node-four-screenshots',
       before={'.github/workflows/release.yml': 'ef1f70a12b746512b2f33c28c36ae4f1e109522f',
               'js/tests/ci-node-shards.test.js': 'ef1f70a12b746512b2f33c28c36ae4f1e109522f'})
