"""Keep the actual Ubuntu deadline failure and finite partition verification."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-ubuntu-deno')
assert 'fail 1' in read('before') and 'ubuntu-26.04' in read('before')
assert 'pass 23' in read('node') and 'skipped 1' in read('node')
assert '2 passed | 0 failed' in read('deno')
assert 'All workflows enforce runner, deadline and checkout policy' in read('policy')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
annotations = json.loads((logs / 'vk-maintenance-parent-deno-annotations.json').read_text())
assert any('maximum execution time of 10m0s' in row['message'] for row in annotations)
parent = '4dca94624c65cb4dd624654baa96cf233483fffe'
sources = ['.github/workflows/release.yml', 'js/tests/ci-deno-shards.test.js',
           'docs/case-studies/issue-56/ci-ubuntu-deno-shards.md',
           'experiments/issue-56/collect-ci-ubuntu-deno.py',
           'experiments/issue-56/analyze-windows-deno.py']
receipts = evidence_logs(root, 'ci-ubuntu-deno')
receipts += [f'ci-logs/vk-maintenance-parent-{name}' for name in [
    'deno.log', 'deno-annotations.json', 'deno-job.json', 'checks-progress.json']]
bundle(root, sources + receipts,
       'docs/case-studies/issue-56/data/ci-ubuntu-deno-shards.tar.gz',
       dict(parent=parent, node_pass=23, node_skip=1, deno_pass=2,
            fixture_files=6, unchanged_deadline_minutes=10, native_shards=3,
            observed_modules=760, issue_complete=False, hosted_verification_pending=True),
       'no-ubuntu-deno-screenshots', before={'.github/workflows/release.yml': parent,
                                           'js/tests/ci-deno-shards.test.js': parent})
