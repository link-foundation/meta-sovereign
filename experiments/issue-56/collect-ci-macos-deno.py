"""Keep the actual macOS Deno deadline and finite native partition checks."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-macos-deno')
assert 'fail 1' in read('before') and 'macos-26' in read('before')
assert 'pass 23' in read('node') and 'skipped 1' in read('node')
assert '2 passed | 0 failed' in read('deno')
assert 'All workflows enforce runner, deadline and checkout policy' in read('policy')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
annotations = json.loads((logs / 'vk-desktop-macos-deno-annotations.json').read_text())
assert any('maximum execution time of 10m0s' in row['message'] for row in annotations)
parent = 'b0bb53aef2fd7556baabfbe6f51103659ce25ef2'
sources = ['.github/workflows/release.yml', 'js/tests/ci-deno-shards.test.js',
           'docs/case-studies/issue-56/ci-macos-deno-shards.md',
           'experiments/issue-56/collect-ci-macos-deno.py',
           'experiments/issue-56/analyze-windows-deno.py']
receipts = evidence_logs(root, 'ci-macos-deno')
receipts += ['ci-logs/vk-desktop-macos-deno.log',
             'ci-logs/vk-desktop-macos-deno-annotations.json',
             'ci-logs/vk-desktop-live-checks.json']
bundle(root, sources + receipts,
       'docs/case-studies/issue-56/data/ci-macos-deno-shards.tar.gz',
       dict(parent=parent, node_pass=23, node_skip=1, deno_pass=2,
            fixture_files=6, unchanged_deadline_minutes=10, native_shards=3,
            observed_modules=758, issue_complete=False, hosted_verification_pending=True),
       'no-macos-deno-screenshots', before={'.github/workflows/release.yml': parent,
                                          'js/tests/ci-deno-shards.test.js': parent})
