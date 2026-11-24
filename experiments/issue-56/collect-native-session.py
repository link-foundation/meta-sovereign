"""Capture finite native application checks without inventing network results."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'native-session')
assert '7 passed; 0 failed' in read('focused')
assert '6 passed; 1 failed' in read('scan-draft')
assert 'finite checks verified' in read('clippy-probe')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('prettier')
assert 'ERROR: jscpd' not in read('duplication')
assert '6.47%' in read('duplication')
for name, expected in [('native-storage-focused.log', ['3 passed; 0 failed', '6 passed; 0 failed']),
                       ('native-owner-focused.log', ['10 passed; 0 failed']),
                       ('native-rich-focused.log', ['5 passed; 0 failed', '4 passed; 0 failed'])]:
    text = (logs / name).read_text()
    assert all(result in text for result in expected)
assert '✔ native default CLI retains acknowledged rich writes' in (logs / 'native-cargo-hosted-rust.log').read_text()
sources = changed_sources(root) + evidence_logs(root, 'native-session')
sources += [f'ci-logs/{name}' for name in [
    'native-storage-focused.log', 'native-owner-focused.log', 'native-rich-focused.log',
    'native-cargo-hosted-rust.log', 'native-cargo-hosted-docs.log', 'native-cargo-head-checks.json']]
bundle(root, sources, 'docs/case-studies/issue-56/data/native-sync-session.tar.gz',
       dict(parent='9db8d8d97da8551b381e7655107904e07afda7d8', std_session_tests=7,
            compatibility_tests=28, scoped_clippy_passed=True,
            focused_peak_rss_kib=215024, clippy_peak_rss_kib=246008,
            unchanged_duplication_threshold=6.5, duplication_percent=6.47,
            draft_middle_key_scan_failure_retained=True,
            hosted_checkpoint_verified_head='3ad29517d0aabbdcea3cf1a86d24ce8ce4ca3cbd',
            exact_parent_sync_verified=False, actual_native_network_sync_verified=False,
            full_local_matrix=False, exact_head_ci_required=True, issue_complete=False),
       'no-native-session-images-*',
       before={f'rust/crates/meta-sovereign-server/src/{name}.rs': '9db8d8d9'
               for name in ['state', 'http', 'main']})
