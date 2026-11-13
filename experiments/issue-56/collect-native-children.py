"""Preserve the actual hosted assertion failure and independent JS evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context

root, logs, _ = evidence_context(__file__, 'native-storage')
assert 'pass 1' in (logs / 'native-storage-child-reference.log').read_text()
rich = (logs / 'native-rich-focused.log').read_text()
assert '5 passed; 0 failed' in rich and '4 passed; 0 failed' in rich
failed = (logs / 'native-storage-head-rust.log').read_text()
assert 'native_durable_reopen_preserves_owner_clocks_deletion_and_private_metadata ... FAILED' in failed
names = changed_sources(root)
names += [f'ci-logs/{name}' for name in [
    'native-storage-head-rust.log', 'native-storage-head-checks.json',
    'native-storage-child-reference.log', 'native-storage-child-native.log',
    'native-storage-child-vectors.log', 'native-rich-focused.log',
    'native-rich-focused-compile.log']]
bundle(root, names, 'docs/case-studies/issue-56/data/native-recreated-children.tar.gz',
       dict(failing_head='25637f4f6948569ad40aa8675d61c669ab7aebee',
            run=43497852404, job=132137416165, failure_lines=[676, 679],
            production_behavior_changed=False, javascript_reference_passed=True,
            native_rich_checks_passed=9, hosted_durable_rerun_required=True,
            issue_complete=False), 'no-native-children-images-*',
       before={'rust/crates/meta-sovereign-server/tests/durable.rs': '25637f4f'})
