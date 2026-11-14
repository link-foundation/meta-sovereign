"""Preserve finite native admission evidence without claiming hosted completion."""
import ast
import re
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'native-storage')
assert '3 passed; 0 failed' in read('focused')
assert '6 passed; 0 failed' in read('focused')
assert 'finite checks verified' in read('clippy-probe')
assert '10 passed; 0 failed' in (logs / 'native-owner-focused.log').read_text()
rich = (logs / 'native-rich-focused.log').read_text()
assert '5 passed; 0 failed' in rich and '4 passed; 0 failed' in rich
for name in ['lint', 'rustfmt', 'secrets', 'python', 'diff-check']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'Changeset validation passed' in read('changeset')
assert 'ERROR: jscpd' not in read('duplication')
assert 'Found ' in read('duplication')
ast.parse((root / 'experiments/issue-56/native-durable-before.py').read_text())
def peak(name):
    return max(map(int, re.findall(r'child_peak_rss_kib=(\d+)', read(name))))

sources = [name for name in changed_sources(root) if (root / name).is_file()]
sources += evidence_logs(root, 'native-storage')
sources += ['ci-logs/native-owner-focused.log', 'ci-logs/native-rich-focused.log',
            'ci-logs/ci-telegram-backlinks-parent-workflow.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/native-durable-storage.tar.gz',
       dict(parent='0f245481b247bdbbf622127deecd97fd095ddb8e',
            std_filesystem_tests=6, std_admission_tests=3, owner_compatibility_tests=10,
            rich_compatibility_tests=9, focused_peak_rss_kib=peak('focused-compile'),
            clippy_peak_rss_kib=peak('clippy-compile'), unchanged_duplication_threshold=6.5,
            exact_parent_cli_expected_failure_registered=True,
            exact_parent_cli_verified=False, official_codec_integration_verified=False,
            full_local_matrix=False, exact_head_ci_required=True,
            native_durable_replication_complete=False, issue_complete=False),
       'no-native-storage-images-*',
       before={f'rust/crates/meta-sovereign-server/src/{name}.rs': '0f245481'
               for name in ['state', 'http', 'main', 'handlers', 'email', 'routes']})
