"""Preserve finite native register convergence and JS-reference evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'native-register')
assert '0 passed; 4 failed' in read('parent')
assert '8 passed; 0 failed' in read('focused')
assert '13 passed; 0 failed' in read('focused')
assert 'Verified 13 finite JavaScript/native register fixtures' in read('vectors-check')
assert 'finite checks verified' in read('clippy-probe')
assert read('clippy-compile').count('child_peak_rss_kib=') == 3
for name in ['lint', 'rustfmt', 'secrets']:
    assert not read(name).strip()
assert 'All matched files use Prettier code style!' in read('format')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root)
           if (root / name).is_file() and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'native-register')
sources += ['js/src/sync/register.js', 'js/src/sync/clock.js',
            'js/src/storage/sync-deletions.js', 'rust/Cargo.toml',
            'rust/crates/meta-sovereign-core/Cargo.toml']
bundle(root, sources, 'docs/case-studies/issue-56/data/native-register.tar.gz',
       dict(parent='8b1c19bad88061055a4c8657f771c947bcdcdd46',
            parent_failures=4, focused_regressions=8, javascript_fixtures=13,
            permutations_per_fixture=6, both_groupings=True,
            duplicate_delivery=True, typed_shape_only=True,
            native_rich_replication_complete=False,
            local_rust='1.99.0', hosted_rust='1.99.1',
            focused_peak_rss_kib=171688, clippy_peak_rss_kib=187752,
            memory_limit_bytes=3135369216, full_local_matrix=False,
            exact_head_ci_required=True, issue_complete=False),
       'no-native-register-images-*.png',
       before={name: '8b1c19ba' for name in [
           'rust/crates/meta-sovereign-core/src/lib.rs',
           '.github/workflows/release.yml']})
