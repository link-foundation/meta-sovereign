"""Preserve the bounded copy-slot regression and exact hosted startup failure."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'release-pool')
assert '4 !== 14' in read('parent')
assert 'fails on dec17a26' in read('parent-replay')
assert 'pass 11' in read('focused') and 'fail 0' in read('focused')
assert 'pass 2' in read('cli') and 'fail 0' in read('cli')
assert '[release] directories_ready' in read('cli')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root) if (root / name).is_file()]
sources += evidence_logs(root, 'release-pool')
sources += ['ci-logs/hub-relay-parent-deno-windows.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-release-copy-pool.tar.gz',
       dict(published_base='dec17a26', parent_failures=1,
            focused_node_checks=13, deno_only_skipped=1,
            max_parallel_copies=4, fixture_files=14,
            exact_head_windows_confirmation_required=True,
            full_local_suite=False),
       'no-ci-release-copy-pool-images-*.png',
       before={'js/src/server/rolling-release.js': 'dec17a26'})
