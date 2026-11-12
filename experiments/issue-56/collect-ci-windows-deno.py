"""Preserve the Windows Deno deadline and bounded native partition evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-windows-deno')
assert 'fail 1' in read('before')
assert 'pass 2' in read('node') and 'skipped 1' in read('node')
assert '2 passed | 0 failed' in read('deno')
assert 'All workflows enforce runner, deadline and checkout policy' in read('policy')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert not read('secrets').strip()
assert any('maximum execution time of 10m0s' in row['message'] for row in
           json.loads((logs / 'cv-prepare-parent-deno-annotations.json').read_text()))
base = 'a795d6bc732b605b43cea79dc5f4b7adbacd972e'
sources = changed_sources(root, base) + evidence_logs(root, 'ci-windows-deno')
sources += [f'ci-logs/cv-prepare-parent-{name}' for name in [
    'windows-deno.log', 'pipeline.log', 'checks.json', 'deno-annotations.json']]
sources += ['ci-logs/cv-prepare-published-runs.json',
            'ci-logs/cv-prepare-published-pr.json', 'ci-logs/deno-test-help.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-windows-deno-shards.tar.gz',
       dict(published_base=base, regression_parent=base, node_pass=2,
            node_skip=1, deno_pass=2, fixture_files=6, shard_count=3,
            unchanged_job_deadline_minutes=10,
            hosted_required='Exact new-head Windows partitions and complete mandatory matrix; every unchecked issue requirement'),
       'no-windows-deno-screenshots',
       before={'.github/workflows/release.yml': base})
