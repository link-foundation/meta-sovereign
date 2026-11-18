"""Preserve exact hosted failures and the independently staged CI correction."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
sources = [
    '.github/workflows/release.yml', '.changeset/visible-browser-defaults.md',
    'rust/crates/meta-sovereign-server/src/main.rs',
    'experiments/issue-56/native_cargo_reference.py',
    'experiments/issue-56/native-cargo-reference-check.py',
    'experiments/issue-56/native-durable-before.py',
    'experiments/issue-56/collect-native-reference.py',
    'docs/case-studies/issue-56/ci-native-reference-artifact.md',
    'docs/case-studies/issue-56/PLAN.md',
]
entries = {name: subprocess.check_output(['git', 'show', f':{name}'], cwd=root) for name in sources}
for suffix in ('check', ''):
    name = 'native-cargo-reference' + (f'-{suffix}' if suffix else '') + '.log'
    entries[f'ci-logs/{name}'] = (root / 'ci-logs' / name).read_bytes()
assert entries['ci-logs/native-cargo-reference-check.log'].count(b'PASS') == 2
for name in ('native-rustdoc-before.log', 'native-rustdoc-after.log',
             'native-children-job-132142558257.log', 'native-children-job-132142558414.log',
             'native-children-head-checks.json', 'native-cargo-format.log'):
    entries[f'ci-logs/{name}'] = (root / 'ci-logs' / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    failing_head='9db8d8d97da8551b381e7655107904e07afda7d8', run=43499087242,
    rust_job=132142558257, docs_job=132142558414,
    local_cargo='1.99.0', hosted_cargo='1.99.1',
    local_shared_output_overwrite=True, local_fresh_rebuild_failure_reproduced=False,
    hosted_corrected_head_verification_required=True, issue_complete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-native-reference-artifact.tar.gz',
                      entries, len(sources))
