"""Retain native rich admission regressions and the observed hosted lint failure."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'native-rich')
assert '0 passed; 4 failed' in read('parent')
for summary in ['5 passed; 0 failed', '4 passed; 0 failed']:
    assert summary in read('focused')
for name in ['clippy-probe', 'typed-clippy-probe']:
    assert 'finite checks verified' in read(name)
assert '27 finite rich register fixtures and 26 number strings' in read('vectors-check')
assert '13 finite JavaScript/native register fixtures' in read('typed-vectors-check')
assert 'twenty-eight finite comparisons' in read('entry-writers')
assert 'PASS: four bounded cases' in read('writer')
for name in ['lint', 'rustfmt', 'secrets', 'python']:
    assert not read(name).strip()
assert 'All matched files use Prettier code style!' in read('format')
assert 'Changeset validation passed' in read('changeset')
assert 'ERROR: jscpd' not in read('duplication-final')
assert 'Found ' in read('duplication-final')
assert '42' in read('parent-lint') and 'threshold (6.5%)' in read('parent-lint')
sources = [name for name in changed_sources(root) if (root / name).is_file()]
sources += evidence_logs(root, 'native-rich')
sources += [f'ci-logs/native-register-{name}.log' for name in ['focused', 'focused-compile',
            'clippy-compile']]
sources += ['js/src/sync/register.js', 'js/src/sync/clock.js',
            'js/src/storage/sync-deletions.js', 'rust/Cargo.toml',
            'rust/crates/meta-sovereign-server/Cargo.toml']
bundle(root, sources, 'docs/case-studies/issue-56/data/native-rich-register.tar.gz',
       dict(parent='b24e1ca5f757c6083e944fcdf17fe565f519dbd8', parent_failures=4,
            mirror_and_number_tests=5, rich_tests=4, javascript_fixtures=27,
            number_strings=26, typed_fixtures=13, permutations=6, both_groupings=True,
            archive_writer_comparisons=28, existing_writer_cases=4,
            focused_peak_rss_kib=175076, clippy_peak_rss_kib=190524,
            hosted_failed_run=43483668506, unchanged_duplication_threshold=6.5,
            full_local_matrix=False, native_durable_replication_complete=False,
            exact_head_ci_required=True, issue_complete=False), 'no-native-rich-images-*.png',
       before={name: 'b24e1ca5' for name in [
           'rust/crates/meta-sovereign-server/src/state.rs',
           'rust/crates/meta-sovereign-core/src/sync.rs',
           'rust/crates/meta-sovereign-core/tests/sync_reference.rs']})
