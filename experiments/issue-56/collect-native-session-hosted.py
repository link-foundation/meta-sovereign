"""Retain actual native interoperability results separately from draft evidence."""
import json
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'native-session-hosted')
head = '1e90229508cfe71ca8c47a5e15924acf2681b5dd'
run = json.loads((logs / 'native-session-hosted-run.json').read_text())
assert run['head_sha'] == head and run['id'] == 43503860150
rust = read('rust')
for result in [
    'Exact parent 9db8d8d97da8551b381e7655107904e07afda7d8:',
    'Error: native CLI did not reconcile schema-13 JavaScript peer',
    '✔ production JavaScript interoperates with native HTTP and mixed signaling peers',
    '✔ native default CLI retains acknowledged rich writes and deletion across restart',
    '✔ native CLI reconciles real JavaScript peers across durable restart',
    '✔ native socket refuses schema/private records and never ACKs failed persistence',
]:
    assert result in rust
assert '##[error]' not in rust
assert 'RUSTDOCFLAGS: -D warnings' in read('docs')
assert '##[error]' not in read('docs')
sources = [f'ci-logs/native-session-hosted-{name}' for name in [
    'rust.log', 'docs.log', 'run.json']]
sources += ['docs/case-studies/issue-56/native-sync-session.md',
            'experiments/issue-56/collect-native-session-hosted.py']
bundle(root, sources, 'docs/case-studies/issue-56/data/native-sync-hosted.tar.gz',
       dict(verified_head=head, run=run['id'], rust_job=132158855257,
            docs_job=132158855409, exact_parent_sync_verified=True,
            actual_native_network_sync_verified=True,
            full_local_matrix=False, issue_complete=False),
       'no-native-session-hosted-images-*')
