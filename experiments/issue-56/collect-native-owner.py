"""Preserve real native owner-route causality and finite JavaScript references."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'native-owner')
assert '0 passed; 4 failed' in read('parent')
assert '10 passed; 0 failed' in read('focused')
assert 'finite checks verified' in read('clippy-probe')
assert '12 owner assignments' in read('vectors-check')
for name in ['lint', 'rustfmt', 'secrets', 'python']:
    assert not read(name).strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'Changeset validation passed' in read('changeset')
assert 'ERROR: jscpd' not in read('duplication')
assert 'Found ' in read('duplication')
sources = [name for name in changed_sources(root) if (root / name).is_file()]
sources += evidence_logs(root, 'native-owner')
sources += ['ci-logs/native-rich-focused.log', 'ci-logs/native-rich-focused-compile.log']
sources += ['js/src/storage/causal-writes.js', 'js/src/storage/universal.js',
            'js/src/sync/register.js', 'js/src/sync/clock.js',
            'js/src/storage/sync-deletions.js', 'rust/Cargo.toml',
            'rust/crates/meta-sovereign-server/Cargo.toml']
bundle(root, sources, 'docs/case-studies/issue-56/data/native-owner-clocks.tar.gz',
       dict(parent='bd954afdf44e681abbf5d4cc97b1bd8ed50efb9a', parent_failures=4,
            owner_tests=10, javascript_owner_fixtures=12, concurrent_writes=3,
            independent_openings=16, focused_peak_rss_kib=202264,
            clippy_peak_rss_kib=223556, unchanged_duplication_threshold=6.5,
            full_local_matrix=False, native_durable_replication_complete=False,
            exact_head_ci_required=True, issue_complete=False), 'no-native-owner-images-*.png',
       before={f'rust/crates/meta-sovereign-server/src/{name}.rs': 'bd954afd'
               for name in ['state', 'record_sync', 'handlers', 'email', 'routes']})
