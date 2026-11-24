"""Preserve the native assertions which reached the unchanged hosted deadline."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-macos-node-eight')
assert 'fail 1' in read('before') and '1/8' in read('before')
assert 'pass 23' in read('node') and 'skipped 1' in read('node') and 'fail 0' in read('node')
assert 'All workflows enforce runner, deadline and checkout policy' in read('policy')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert any('maximum execution time of 10m0s' in row['message'] for row in
           json.loads((logs / 'vk-cancelled-macos-node-annotations.json').read_text()))
sources = ['.github/workflows/release.yml', 'js/tests/ci-node-shards.test.js',
           'docs/case-studies/issue-56/ci-macos-node-eight.md',
           'experiments/issue-56/collect-ci-macos-node-eight.py']
receipts = ['ci-logs/vk-cancelled-macos-node.log',
            'ci-logs/vk-cancelled-macos-node-job.json',
            'ci-logs/vk-cancelled-macos-node-annotations.json']
bundle(root, sources + receipts + evidence_logs(root, 'ci-macos-node-eight'),
       'docs/case-studies/issue-56/data/ci-macos-node-eight.tar.gz',
       dict(parent='07d3159e73bc8ee4620904260905b1b3ca251c20', node_pass=23,
            node_skip=1, native_shards=8, fixture_files=6,
            unchanged_deadline_minutes=10, hosted_verification_pending=True,
            issue_complete=False), 'no-macos-node-eight-screenshots',
       before={'.github/workflows/release.yml': '07d3159e',
               'js/tests/ci-node-shards.test.js': '07d3159e'})
